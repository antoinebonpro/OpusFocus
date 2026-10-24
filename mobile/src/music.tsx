import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isAudioFile, trackTitle } from "./logic";
import { useAppState } from "./state";

/** Musique focus : les pistes importées sont copiées dans l'application, comme le dossier Music sur PC. */
export type Track = { file: string; title: string; uri: string };

type Saved = { volume: number; file: string | null; pos: { file: string; t: number } | null };
const KEY = "opusfocus.music.v1";

type Ctx = {
  tracks: Track[] | null;
  current: Track | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  select: (i: number) => void;
  seek: (fraction: number) => void;
  setVolume: (v: number) => void;
  importTracks: () => Promise<number>;
  removeTrack: (file: string) => void;
};

const MusicContext = createContext<Ctx | null>(null);

function musicDir() {
  const dir = new Directory(Paths.document, "music");
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function listTracks(): Track[] {
  try {
    return musicDir()
      .list()
      .filter((item): item is File => item instanceof File && isAudioFile(item.name))
      .map((f) => ({ file: f.name, title: trackTitle(f.name), uri: f.uri }))
      .sort((a, b) => a.file.localeCompare(b.file, "fr", { sensitivity: "base" }));
  } catch {
    return [];
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const s = useAppState();
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [volume, setVolumeState] = useState(0.6);
  const loaded = useRef<string | null>(null); // fichier chargé dans le lecteur
  const pendingSeek = useRef<number | null>(null);
  const saved = useRef<Saved>({ volume: 0.6, file: null, pos: null });
  const savedAt = useRef(0);
  const auto = useRef(false); // lancée par le début de la session : elle s'arrêtera avec elle
  const tracksRef = useRef<Track[]>([]);
  // Le lecteur se règle par affectation (player.volume = …) : on y accède par une référence, hors du rendu.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const updateTracks = useCallback((list: Track[]) => {
    tracksRef.current = list;
    setTracks(list);
  }, []);

  const persist = useCallback((patch: Partial<Saved>) => {
    saved.current = { ...saved.current, ...patch };
    AsyncStorage.setItem(KEY, JSON.stringify(saved.current)).catch(() => undefined);
  }, []);

  useEffect(() => {
    // Lecture en arrière-plan et sur l'écran verrouillé : on travaille souvent téléphone posé.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => undefined);
    (async () => {
      const raw = await AsyncStorage.getItem(KEY).catch(() => null);
      if (raw) saved.current = { ...saved.current, ...(JSON.parse(raw) as Partial<Saved>) };
      const v = Math.min(1, Math.max(0, saved.current.volume));
      setVolumeState(v);
      playerRef.current.volume = v;
      const list = listTracks();
      updateTracks(list);
      const i = list.findIndex((t) => t.file === saved.current.file);
      setIdx(i >= 0 ? i : 0);
    })().catch(() => updateTracks([]));
  }, [updateTracks]);

  const load = useCallback((i: number, list: Track[]) => {
    const t = list[i];
    if (!t) return null;
    player.replace({ uri: t.uri });
    loaded.current = t.file;
    // Les pistes durent souvent des heures : on reprend là où on s'était arrêté.
    const pos = saved.current.pos;
    pendingSeek.current = pos?.file === t.file && pos.t > 5 ? pos.t : null;
    persist({ file: t.file });
    return t;
  }, [persist, player]);

  const playAt = useCallback((i: number) => {
    const list = tracksRef.current;
    if (!list.length) return;
    const n = ((i % list.length) + list.length) % list.length;
    setIdx(n);
    const t = load(n, list);
    if (!t) return;
    player.play();
    player.setActiveForLockScreen(true, { title: t.title, artist: "OpusFocus" });
  }, [load, player]);

  const play = useCallback(() => {
    const list = tracksRef.current;
    const t = list[idx];
    if (!t) return;
    if (loaded.current !== t.file) return playAt(idx);
    player.play();
    player.setActiveForLockScreen(true, { title: t.title, artist: "OpusFocus" });
  }, [idx, playAt, player]);

  // Reprise de la position enregistrée dès que la piste est chargée.
  useEffect(() => {
    if (status.isLoaded && pendingSeek.current !== null && status.duration > 0) {
      const t = pendingSeek.current;
      pendingSeek.current = null;
      if (t < status.duration - 5) player.seekTo(t).catch(() => undefined);
    }
  }, [player, status.duration, status.isLoaded]);

  // Position enregistrée toutes les 5 s ; piste suivante à la fin.
  useEffect(() => {
    if (status.playing && loaded.current && Date.now() - savedAt.current > 5000) {
      savedAt.current = Date.now();
      persist({ pos: { file: loaded.current, t: status.currentTime } });
    }
    if (status.didJustFinish) {
      persist({ pos: null });
      playAt(idx + 1);
    }
  }, [idx, persist, playAt, status.currentTime, status.didJustFinish, status.playing]);

  // Lancement et arrêt avec la session, si l'utilisateur l'a demandé (comme sur PC).
  const wasLive = useRef(!!s.live);
  useEffect(() => {
    const live = !!s.live;
    if (live && !wasLive.current && s.config.musicAutoplay && !player.playing && tracksRef.current.length) {
      auto.current = true;
      play();
    }
    if (!live && wasLive.current && auto.current) {
      player.pause();
      auto.current = false;
    }
    wasLive.current = live;
  }, [play, player, s.config.musicAutoplay, s.live]);

  const value: Ctx = {
    tracks,
    current: tracks?.[idx] ?? null,
    playing: status.playing,
    currentTime: status.currentTime,
    duration: status.duration,
    volume,
    toggle: () => (player.playing ? player.pause() : play()),
    next: () => playAt(idx + 1),
    // Comme un lecteur classique : au-delà de 5 s, « précédent » revient au début de la piste.
    prev: () => (status.currentTime > 5 && loaded.current ? player.seekTo(0).catch(() => undefined) : playAt(idx - 1)),
    select: (i) => playAt(i),
    seek: (fraction) => {
      if (status.duration > 0) player.seekTo(fraction * status.duration).catch(() => undefined);
    },
    setVolume: (v) => {
      const vol = Math.min(1, Math.max(0, v));
      playerRef.current.volume = vol;
      setVolumeState(vol);
      persist({ volume: vol });
    },
    importTracks: async () => {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return 0;
      const dir = musicDir();
      let added = 0;
      for (const asset of res.assets) {
        const name = asset.name.replace(/[\\/:*?"<>|]/g, "_");
        if (!isAudioFile(name) && !asset.mimeType?.startsWith("audio/")) continue;
        const dest = new File(dir, isAudioFile(name) ? name : `${name}.m4a`);
        if (dest.exists) dest.delete();
        new File(asset.uri).move(dest);
        added++;
      }
      const list = listTracks();
      updateTracks(list);
      const cur = list.findIndex((t) => t.file === loaded.current);
      if (cur >= 0) setIdx(cur);
      return added;
    },
    removeTrack: (file) => {
      if (loaded.current === file) {
        player.pause();
        player.replace(null);
        loaded.current = null;
      }
      try {
        new File(musicDir(), file).delete();
      } catch {
        // Déjà supprimé.
      }
      const list = listTracks();
      updateTracks(list);
      setIdx((i) => Math.min(i, Math.max(0, list.length - 1)));
    },
  };

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export const useMusic = () => {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic hors de MusicProvider");
  return ctx;
};

export const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const t = Math.floor(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
