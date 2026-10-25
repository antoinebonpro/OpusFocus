import { StatusBar } from "expo-status-bar";
import { ComponentRef, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtRemaining } from "./src/format";
import { MusicProvider, useMusic } from "./src/music";
import { AppsScreen } from "./src/screens/AppsScreen";
import { MusicScreen, PlayerControls } from "./src/screens/MusicScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { RitualScreen } from "./src/screens/RitualScreen";
import { RulesScreen } from "./src/screens/RulesScreen";
import { SessionScreen } from "./src/screens/SessionScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SitesScreen } from "./src/screens/SitesScreen";
import { StateProvider, useAppState } from "./src/state";
import { radius, useColors } from "./src/theme";
import { Icon, PageHead, ToastProvider } from "./src/ui";

type Tab = "session" | "apps" | "sites" | "progress" | "more";
type Sub = "music" | "ritual" | "rules" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "session", label: "Session", icon: "timer" },
  { id: "apps", label: "Applis", icon: "grid" },
  { id: "sites", label: "Sites", icon: "globe" },
  { id: "progress", label: "Progrès", icon: "chart" },
  { id: "more", label: "Plus", icon: "more" },
];

const SUBS: { id: Sub; label: string; desc: string; icon: string }[] = [
  { id: "music", label: "Musique focus", desc: "Ta musique de concentration", icon: "music" },
  { id: "ritual", label: "Fin de journée", desc: "Le rituel « Shutdown complete »", icon: "moon" },
  { id: "rules", label: "Principes", desc: "Les 4 règles du Deep Work", icon: "book" },
  { id: "settings", label: "Réglages", desc: "Démarrage, musique, autorisations", icon: "gear" },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StateProvider>
        <MusicProvider>
          <Shell />
        </MusicProvider>
      </StateProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const c = useColors();
  const s = useAppState();
  const music = useMusic();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("session");
  const [sub, setSub] = useState<Sub | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const go = (t: Tab, page: Sub | null = null) => {
    setTab(t);
    setSub(page);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // Bouton retour d'Android : sous-page → menu « Plus » → onglet Session, puis sortie de l'application.
  useEffect(() => {
    const h = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sub) { setSub(null); return true; }
      if (tab !== "session") { go("session"); return true; }
      return false;
    });
    return () => h.remove();
  });

  // Une session qui se termine ramène au bilan, comme la fenêtre qui se rouvre sur PC.
  useEffect(() => {
    if (s.review) go("session");
  }, [s.review]);

  const showMini = !!music.current && !(tab === "more" && sub === "music");
  const tabBarHeight = 60 + Math.max(insets.bottom, 8);

  let content;
  if (!s.ready) content = <ActivityIndicator color={c.accent} style={{ flex: 1 }} />;
  else if (tab === "apps") content = <AppsScreen />; // la liste gère son propre défilement
  else {
    content = (
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {tab === "session" && <SessionScreen goApps={() => go("apps")} goSites={() => go("sites")} goProgress={() => go("progress")} />}
        {tab === "sites" && <SitesScreen />}
        {tab === "progress" && <ProgressScreen goSession={() => go("session")} />}
        {tab === "more" && !sub && <MoreMenu open={(p) => go("more", p)} />}
        {tab === "more" && sub && (
          <View style={{ gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Retour au menu Plus" onPress={() => setSub(null)} hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: 4 }}>
              <Icon name="back" size={18} color={c.accent} />
              <Text style={{ color: c.accent, fontWeight: "600" }}>Plus</Text>
            </Pressable>
            {sub === "music" && <MusicScreen />}
            {sub === "ritual" && <RitualScreen />}
            {sub === "rules" && <RulesScreen />}
            {sub === "settings" && <SettingsScreen />}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <StatusBar style={c.bg === "#0d1814" ? "light" : "dark"} />
      <ToastProvider bottom={tabBarHeight + (showMini ? 66 : 12)}>
        <View style={{ flex: 1 }}>{content}</View>
        {showMini && <MiniPlayer onOpen={() => go("more", "music")} />}
        <View style={[styles.tabs, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }]}
          accessibilityRole="tablist">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: active }}
                onPress={() => go(t.id)} style={styles.tab}>
                <View style={[styles.tabIco, active && { backgroundColor: c.accentSoft }]}>
                  <Icon name={t.icon} size={21} color={active ? c.accent : c.muted} />
                  {t.id === "session" && s.live && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
                </View>
                <Text style={{ color: active ? c.accent : c.muted, fontSize: 11, fontWeight: active ? "700" : "500" }}>
                  {t.id === "session" && s.live && !active ? fmtRemaining(s.live.endAt - s.now) : t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ToastProvider>
    </View>
  );
}

function MoreMenu({ open }: { open: (p: Sub) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <PageHead title="Plus" />
      {SUBS.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => open(p.id)}
          style={({ pressed }) => [styles.menuRow, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
          <View style={[styles.menuIco, { backgroundColor: c.accentSoft }]}>
            <Icon name={p.icon} size={19} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>{p.label}</Text>
            <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{p.desc}</Text>
          </View>
          <Icon name="chevron" size={18} color={c.faint} />
        </Pressable>
      ))}
    </View>
  );
}

function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const c = useColors();
  const m = useMusic();
  const pct = m.duration > 0 ? (m.currentTime / m.duration) * 100 : 0;
  return (
    <View style={[styles.mini, { backgroundColor: c.surface2, borderTopColor: c.border }]}>
      <View style={[styles.miniBar, { width: `${pct}%`, backgroundColor: c.accent }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir la musique focus" onPress={onOpen}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="music" size={18} color={c.accent} />
        <Text numberOfLines={1} style={{ color: c.text, fontWeight: "600", flex: 1 }}>{m.current?.title}</Text>
      </Pressable>
      <PlayerControls />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderTopWidth: 1, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", gap: 3, minHeight: 52 },
  tabIco: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  dot: { position: "absolute", top: 3, right: 12, width: 7, height: 7, borderRadius: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1 },
  menuIco: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mini: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 16, paddingRight: 8, height: 56, borderTopWidth: 1 },
  miniBar: { position: "absolute", top: 0, left: 0, height: 2 },
});
