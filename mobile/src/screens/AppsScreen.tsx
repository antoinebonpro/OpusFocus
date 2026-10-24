import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Blocker from "../../modules/focus-blocker";
import type { BlockMode, InstalledApp } from "../../modules/focus-blocker";
import { plural } from "../format";
import { CATEGORIES, DISTRACTING, lockAllows, SUGGESTED_CATEGORIES } from "../logic";
import { activeList, useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Banner, Button, CheckRow, Chip, Helper, Icon, PageHead, useToast } from "../ui";

const MODES: { id: BlockMode; title: string; desc: string }[] = [
  { id: "allow", title: "Seulement mes apps", desc: "Tout est bloqué sauf les apps cochées." },
  { id: "block", title: "Bloquer des apps", desc: "Seules les apps cochées sont bloquées." },
];

const isSuggested = (a: InstalledApp) => SUGGESTED_CATEGORIES.has(a.category) || DISTRACTING.has(a.packageName);

export function AppsScreen() {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [essentials] = useState(() => new Set(Blocker.getEssentialPackages()));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const mode = s.config.mode;
  const allow = mode === "allow";
  const live = !!s.live;
  const locked = !!s.live?.lock;
  const list = activeList(s.config);
  const checked = useMemo(() => new Set(list), [list]);

  useEffect(() => {
    Blocker.getInstalledApps().then(setApps).catch(() => setApps([]));
  }, []);

  const isEssential = useCallback((pkg: string) => allow && essentials.has(pkg), [allow, essentials]);

  /** Enregistre la nouvelle liste, si le mode engagement le permet. */
  const save = useCallback((next: string[]) => {
    if (locked && !lockAllows(list, next, allow)) {
      return toast(allow
        ? "Mode engagement : tu peux retirer des apps autorisées, pas en ajouter."
        : "Mode engagement : tu peux ajouter des blocages, pas en retirer.", true);
    }
    s.updateConfig(allow ? { allowed: next } : { apps: next });
  }, [allow, list, locked, s, toast]);

  const toggle = useCallback((pkg: string) => {
    if (isEssential(pkg)) return toast("Toujours permise : le téléphone doit rester utilisable.");
    save(checked.has(pkg) ? list.filter((p) => p !== pkg) : [...list, pkg]);
  }, [checked, isEssential, list, save, toast]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {
      all: apps?.length ?? 0,
      checked: apps?.filter((a) => checked.has(a.packageName)).length ?? 0,
      suggested: apps?.filter(isSuggested).length ?? 0,
    };
    for (const k of Object.keys(CATEGORIES)) out[k] = apps?.filter((a) => a.category === k).length ?? 0;
    return out;
  }, [apps, checked]);

  const effective = counts[filter] || filter === "all" || filter === "checked" ? filter : "all";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Sur « Toutes », les cochées puis les suggestions passent en premier (comme sur PC) ;
    // en liste blanche, les apps toujours permises sont regroupées à la fin.
    const rank = (a: InstalledApp) => (isEssential(a.packageName) ? 3
      : effective === "all" && !q ? (checked.has(a.packageName) ? 0 : !allow && isSuggested(a) ? 1 : 2) : 0);
    return (apps ?? [])
      .filter((a) => {
        if (q && !a.label.toLowerCase().includes(q) && !a.packageName.includes(q)) return false;
        if (effective === "checked") return checked.has(a.packageName);
        if (effective === "suggested") return isSuggested(a);
        return effective === "all" || a.category === effective;
      })
      .sort((a, b) => rank(a) - rank(b));
  }, [allow, apps, checked, effective, isEssential, query]);

  const missing = !allow && apps ? apps.filter((a) => isSuggested(a) && !checked.has(a.packageName)) : [];

  const chips: [string, string][] = [
    ["all", "Toutes"], ["checked", allow ? "Autorisées" : "Bloquées"],
    ...(!allow ? [["suggested", "Suggérées"] as [string, string]] : []),
    ...Object.entries(CATEGORIES),
  ];

  const header = (
    <View style={{ gap: 14, paddingBottom: 12 }}>
      <PageHead eyebrow="Pendant les sessions" title="Applications" />

      <View style={[styles.modes, { backgroundColor: c.surface2, borderColor: c.border }]} accessibilityRole="radiogroup">
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <Pressable key={m.id} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: live }}
              disabled={live} onPress={() => s.updateConfig({ mode: m.id })}
              style={[styles.mode, on && { backgroundColor: c.surface, borderColor: c.accentLine }]}>
              <Text style={{ color: on ? c.accent : c.text, fontWeight: "700", fontSize: 14 }}>{m.title}</Text>
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{m.desc}</Text>
            </Pressable>
          );
        })}
      </View>
      {live && <Helper>Le mode se change entre deux sessions.</Helper>}

      <Helper>
        {allow
          ? "Coche les seules applications que tu pourras ouvrir pendant une session. Le téléphone, l'écran d'accueil, le clavier et les réglages restent toujours accessibles."
          : "Coche les applications qui te distraient. Pendant une session, elles se ferment dès qu'elles s'ouvrent."}
      </Helper>

      {locked && (
        <Banner icon="lock" title="Mode engagement actif"
          text={allow ? "Tu peux retirer des applications autorisées, pas en ajouter avant la fin de la session."
            : "Tu peux ajouter des applications, pas en retirer avant la fin de la session."} />
      )}

      <View style={[styles.search, { backgroundColor: c.surface2, borderColor: c.borderStrong }]}>
        <Icon name="search" size={18} color={c.faint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher une application" placeholderTextColor={c.faint}
          accessibilityLabel="Rechercher une application"
          style={{ flex: 1, color: c.text, fontSize: 16, minHeight: 46 }} autoCorrect={false} />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Effacer la recherche">
            <Icon name="x" size={18} color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {chips.filter(([k]) => counts[k] || k === "all" || k === "checked").map(([k, l]) => (
          <Chip key={k} label={l} count={counts[k]} selected={effective === k} onPress={() => setFilter(k)} />
        ))}
      </View>

      {missing.length > 0 && !query && (
        <Banner icon="sparkle" title={`${plural(missing.length, "distraction détectée", "distractions détectées")} sur ton téléphone`}
          text={`${missing.slice(0, 4).map((a) => a.label).join(", ")}${missing.length > 4 ? "…" : ""}`}
          action={<Button small variant="primary" label="Tout cocher" onPress={() => save([...new Set([...list, ...missing.map((a) => a.packageName)])])} />} />
      )}
    </View>
  );

  if (!Blocker.blockerAvailable) {
    return (
      <View style={{ padding: 20 }}>
        {header}
        <Helper>La liste des applications est disponible dans l'application Android installée.</Helper>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={shown}
        keyExtractor={(a) => a.packageName}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 20, paddingBottom: 90 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={9}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          apps === null ? <ActivityIndicator color={c.accent} style={{ marginTop: 30 }} /> : (
            <Helper style={{ textAlign: "center", marginTop: 30 }}>
              {query ? `Aucune application ne correspond à « ${query} ».` : "Aucune application ici."}
            </Helper>
          )
        }
        renderItem={({ item }) => {
          const essential = isEssential(item.packageName);
          const on = checked.has(item.packageName) || essential;
          return (
            <CheckRow
              title={item.label}
              sub={essential ? "Toujours permise" : item.packageName}
              checked={on}
              disabled={essential || (locked && !lockAllows(list, on ? list.filter((p) => p !== item.packageName) : [...list, item.packageName], allow))}
              onPress={() => toggle(item.packageName)}
              media={<Image source={{ uri: `data:image/png;base64,${item.icon}` }} style={styles.icon} />}
              tag={!allow && isSuggested(item) && item.category !== "other" ? (
                <View style={[styles.tag, { backgroundColor: c.accentSoft }]}>
                  <Text style={{ color: c.accent, fontSize: 11, fontWeight: "700" }}>{CATEGORIES[item.category].split(" ")[0]}</Text>
                </View>
              ) : undefined}
            />
          );
        }}
      />
      <View style={[styles.foot, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ color: c.text, flex: 1 }}>
          <Text style={{ fontWeight: "700" }}>{counts.checked}</Text>{" "}
          {allow
            ? `${counts.checked > 1 ? "applications autorisées" : "application autorisée"} pendant les sessions`
            : `${counts.checked > 1 ? "applications bloquées" : "application bloquée"} pendant les sessions`}
        </Text>
        {!locked && list.length > 0 && (
          <Button small label="Tout décocher" onPress={() => s.updateConfig(allow ? { allowed: [] } : { apps: [] })} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", gap: 6, padding: 4, borderRadius: radius.md, borderWidth: 1 },
  mode: { flex: 1, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },
  search: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12 },
  icon: { width: 34, height: 34, borderRadius: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1 },
});
