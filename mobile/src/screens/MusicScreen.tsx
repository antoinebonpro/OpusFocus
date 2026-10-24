import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { plural } from "../format";
import { fmtTime, useMusic } from "../music";
import { useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Button, Card, Helper, Icon, IconButton, PageHead, Slider, ToggleRow, useToast } from "../ui";

/** Commandes du lecteur, partagées par l'écran Musique et le mini-lecteur. */
export function PlayerControls({ big }: { big?: boolean }) {
  const c = useColors();
  const m = useMusic();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: big ? 18 : 4 }}>
      <IconButton icon="skipBack" label="Piste précédente" onPress={m.prev} size={big ? 24 : 20} />
      <Pressable accessibilityRole="button" accessibilityLabel={m.playing ? "Pause" : "Lecture"} onPress={m.toggle}
        style={({ pressed }) => [styles.play, big && styles.playBig, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
        <Icon name={m.playing ? "pause" : "play"} size={big ? 26 : 18} color={c.onAccent} />
      </Pressable>
      <IconButton icon="skipForward" label="Piste suivante" onPress={m.next} size={big ? 24 : 20} />
    </View>
  );
}

export function MusicScreen() {
  const c = useColors();
  const s = useAppState();
  const m = useMusic();
  const toast = useToast();
  const [seeking, setSeeking] = useState<number | null>(null);
  const progress = seeking ?? (m.duration > 0 ? m.currentTime / m.duration : 0);

  const importTracks = async () => {
    try {
      const n = await m.importTracks();
      if (n) toast(`${plural(n, "piste ajoutée", "pistes ajoutées")}`);
    } catch (e) {
      toast(`Import impossible : ${(e as Error).message}`, true);
    }
  };

  const remove = (file: string, title: string) =>
    Alert.alert("Retirer cette piste ?", `« ${title} » sera supprimée d'OpusFocus (le fichier d'origine reste sur ton téléphone).`, [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => m.removeTrack(file) },
    ]);

  return (
    <View style={{ gap: 14 }}>
      <PageHead title="Musique focus" text="Ta musique de concentration, qui continue écran éteint et pendant les sessions." />

      {m.current ? (
        <Card style={{ gap: 12 }}>
          <Text numberOfLines={2} style={{ color: c.text, fontWeight: "700", fontSize: 17, textAlign: "center" }}>{m.current.title}</Text>
          <Slider label="Position dans la piste" value={progress} onChange={setSeeking}
            onDone={(v) => { m.seek(v); setSeeking(null); }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.time(c.muted)}>{fmtTime(seeking !== null ? seeking * m.duration : m.currentTime)}</Text>
            <Text style={styles.time(c.muted)}>{fmtTime(m.duration)}</Text>
          </View>
          <PlayerControls big />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Icon name="music" size={16} color={c.muted} />
            <View style={{ flex: 1 }}>
              <Slider label="Volume" value={m.volume} onChange={m.setVolume} />
            </View>
          </View>
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 6 }}>
        <ToggleRow icon="timer" title="Lancer avec la session" value={s.config.musicAutoplay}
          onChange={(v) => s.updateConfig({ musicAutoplay: v })}
          desc="La musique démarre au début de chaque session et s'arrête à la fin." />
      </Card>

      <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>
        Pistes <Text style={{ color: c.muted, fontWeight: "500" }}>{m.tracks?.length ?? 0}</Text>
      </Text>
      {m.tracks?.length ? (
        <View style={{ gap: 8 }}>
          {m.tracks.map((t, i) => {
            const current = m.current?.file === t.file;
            return (
              <Pressable key={t.file} accessibilityRole="button" accessibilityState={{ selected: current }}
                onPress={() => m.select(i)} onLongPress={() => remove(t.file, t.title)}
                style={({ pressed }) => [styles.track, {
                  backgroundColor: current ? c.accentSoft : c.surface, borderColor: current ? c.accentLine : c.border, opacity: pressed ? 0.85 : 1,
                }]}>
                <Icon name={current && m.playing ? "music" : "play"} size={16} color={current ? c.accent : c.muted} />
                <Text numberOfLines={2} style={{ color: c.text, flex: 1, fontWeight: current ? "700" : "500" }}>{t.title}</Text>
                <IconButton icon="trash" label={`Retirer ${t.title}`} size={17} color={c.faint} onPress={() => remove(t.file, t.title)} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Helper>Ajoute tes fichiers audio (mp3, m4a…). Ils sont copiés dans OpusFocus et restent disponibles hors connexion.</Helper>
      )}
      <Button icon="folder" label="Ajouter des pistes" onPress={importTracks} />
    </View>
  );
}

const styles = {
  ...StyleSheet.create({
    play: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    playBig: { width: 60, height: 60, borderRadius: 30 },
    track: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingLeft: 14, paddingRight: 4, borderRadius: radius.sm, borderWidth: 1 },
  }),
  time: (color: string) => ({ color, fontSize: 12, fontVariant: ["tabular-nums" as const] }),
};
