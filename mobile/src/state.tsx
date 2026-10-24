import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Blocker from "../modules/focus-blocker";
import { ABANDON_PHRASE, cleanPhrase, DEFAULT_CHECKLIST, DEFAULT_SITES } from "./logic";

/** Réglages : mêmes options que sur PC, plus le mode liste blanche propre au téléphone. */
export type Config = {
  /** `apps` : liste noire (mode « block »). `allowed` : liste blanche (mode « allow »). */
  mode: Blocker.BlockMode;
  apps: string[];
  allowed: string[];
  sites: string[];
  minutes: number;
  /** Protections choisies pour la prochaine session. */
  notif: boolean;
  blockApps: boolean;
  blockSites: boolean;
  lock: boolean;
  weeklyGoalHours: number;
  musicAutoplay: boolean;
  openAtBoot: boolean;
  shutdownChecklist: string[];
  /** Jour (AAAA-MM-JJ) du dernier « Shutdown complete ». */
  lastShutdown: string | null;
  /** Phrase à recopier pour abandonner une session en mode engagement. */
  abandonPhrase: string;
};

/** Liste d'applications qui s'applique avec le mode choisi. */
export const activeList = (c: Config) => (c.mode === "allow" ? c.allowed : c.apps);

export type Live = {
  intention: string;
  startedAt: number;
  endAt: number;
  plannedMin: number;
  lock: boolean;
  notif: boolean;
  apps: boolean;
  sites: boolean;
  /** Phrase d'abandon fixée au début de la session (la changer pendant la session n'a pas d'effet). */
  phrase?: string;
};
export type SessionRecord = {
  id: string;
  intention: string;
  startedAt: number;
  endedAt: number;
  plannedMin: number;
  actualMin: number;
  completed: boolean;
  blocked: number;
  /** Profondeur notée au bilan (1 à 5), ou null. */
  depth: number | null;
  note: string;
};
/** `history` va du plus récent au plus ancien. `review` : session qui attend son bilan. */
type Data = { config: Config; live: Live | null; history: SessionRecord[]; review: string | null };

const KEY = "opusfocus.state.v1";
/** Clé des versions nommées « Deep Work Focus » : reprise une fois, puis effacée. */
const LEGACY_KEY = "dwf.state.v1";

const DEFAULT_CONFIG: Config = {
  mode: "allow", apps: [], allowed: [], sites: DEFAULT_SITES, minutes: 90,
  notif: true, blockApps: true, blockSites: true, lock: false,
  weeklyGoalHours: 15, musicAutoplay: false, openAtBoot: true,
  shutdownChecklist: DEFAULT_CHECKLIST, lastShutdown: null, abandonPhrase: ABANDON_PHRASE,
};

/** Phrase à taper pour abandonner : celle de la session en cours, sinon celle des réglages. */
export const abandonPhrase = (d: { config: Config; live: Live | null }) =>
  d.live?.phrase || cleanPhrase(d.config.abandonPhrase) || ABANDON_PHRASE;
const DEFAULTS: Data = { config: DEFAULT_CONFIG, live: null, history: [], review: null };

/** Données enregistrées → données complètes (champs ajoutés depuis remplis par défaut). */
export function restore(raw: string): Data {
  const saved = JSON.parse(raw) as Partial<Data>;
  const history = (saved.history ?? []).map((r) => ({ ...r, depth: r.depth ?? null, note: r.note ?? "" }));
  // Sessions enregistrées par une version qui n'avait pas encore ces protections.
  const l = saved.live as (Partial<Live> & Omit<Live, "notif" | "apps" | "sites">) | null | undefined;
  const live = l ? { ...l, notif: l.notif ?? false, apps: l.apps ?? true, sites: l.sites ?? false } : null;
  return { config: { ...DEFAULT_CONFIG, ...saved.config }, live, history, review: saved.review ?? null };
}

type StartOptions = { intention: string; minutes: number; notif: boolean; apps: boolean; sites: boolean; lock: boolean };

type Ctx = Data & {
  ready: boolean;
  now: number;
  status: Blocker.BlockerStatus;
  updateConfig: (patch: Partial<Config>) => void;
  /** Démarre la session ; renvoie les protections qui n'ont pas pu être activées. */
  start: (o: StartOptions) => string[];
  finish: (completed: boolean) => void;
  saveReview: (id: string, depth: number | null, note: string) => void;
};

const StateContext = createContext<Ctx | null>(null);

export function StateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<Blocker.BlockerStatus>(() => Blocker.getStatus());
  // Toujours à jour : chaque changement passe par commit() ou par le chargement initial.
  const dataRef = useRef(data);

  const commit = useCallback((next: Data) => {
    dataRef.current = next;
    setData(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  useEffect(() => {
    (async () => {
      let raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        raw = await AsyncStorage.getItem(LEGACY_KEY);
        if (raw) {
          await AsyncStorage.setItem(KEY, raw);
          await AsyncStorage.removeItem(LEGACY_KEY);
        }
      }
      if (raw) {
        const d = restore(raw);
        dataRef.current = d;
        setData(d);
      }
      // Le réglage natif (lu au démarrage du téléphone) suit celui de l'application.
      Blocker.setOpenAtBoot(dataRef.current.config.openAtBoot);
    })()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const finish = useCallback(
    (completed: boolean) => {
      const d = dataRef.current;
      if (!d.live) return;
      const end = completed ? d.live.endAt : Date.now();
      const record: SessionRecord = {
        id: String(d.live.startedAt),
        intention: d.live.intention,
        startedAt: d.live.startedAt,
        endedAt: end,
        plannedMin: d.live.plannedMin,
        actualMin: Math.max(0, Math.min(d.live.plannedMin, (end - d.live.startedAt) / 60000)),
        completed,
        blocked: Blocker.getStatus().blockedCount,
        depth: null,
        note: "",
      };
      Blocker.stopSession();
      commit({ ...d, live: null, history: [record, ...d.history].slice(0, 1000), review: record.id });
    },
    [commit],
  );

  // Horloge : fait avancer le minuteur et termine la session à l'heure prévue.
  useEffect(() => {
    if (!data.live) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setStatus(Blocker.getStatus());
      if (dataRef.current.live && t >= dataRef.current.live.endAt) finish(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [data.live, finish]);

  // Hors session, l'horloge ne sert qu'aux heures de fin affichées : une mise à jour toutes les 30 s suffit.
  useEffect(() => {
    if (data.live) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [data.live]);

  const value: Ctx = {
    ...data,
    ready,
    now,
    status,
    updateConfig: (patch) => {
      const d = dataRef.current;
      const config = { ...d.config, ...patch };
      if (d.live) Blocker.updateLists(config.mode, activeList(config), config.sites);
      if (patch.openAtBoot !== undefined) Blocker.setOpenAtBoot(patch.openAtBoot);
      commit({ ...d, config });
    },
    start: (o) => {
      const d = dataRef.current;
      const startedAt = Date.now();
      const endAt = startedAt + o.minutes * 60000;
      const live: Live = {
        intention: o.intention, startedAt, endAt, plannedMin: o.minutes, lock: o.lock, notif: o.notif, apps: o.apps, sites: o.sites,
        phrase: abandonPhrase({ config: d.config, live: null }),
      };
      const warnings = Blocker.startSession({
        startAt: startedAt, endAt, intention: o.intention, blockApps: o.apps, mode: d.config.mode,
        packages: activeList(d.config), blockSites: o.sites, domains: d.config.sites, silence: o.notif,
      });
      setNow(startedAt);
      setStatus(Blocker.getStatus());
      commit({
        ...d, live, review: null,
        config: { ...d.config, minutes: o.minutes, notif: o.notif, blockApps: o.apps, blockSites: o.sites, lock: o.lock },
      });
      return warnings;
    },
    finish,
    saveReview: (id, depth, note) => {
      const d = dataRef.current;
      const history = d.history.map((r) =>
        r.id === id ? { ...r, depth: depth && depth >= 1 && depth <= 5 ? depth : null, note: note.trim().slice(0, 500) } : r);
      commit({ ...d, history, review: null });
    },
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export const useAppState = () => {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState hors de StateProvider");
  return ctx;
};
