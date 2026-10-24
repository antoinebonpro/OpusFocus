import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cleanDomain, lockAllows, SITE_CATALOG } from "../logic";
import { useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Avatar, Banner, Button, CheckRow, Helper, Icon, PageHead, useToast } from "../ui";

export function SitesScreen() {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState("");
  const selected = useMemo(() => new Set(s.config.sites), [s.config.sites]);
  const locked = !!s.live?.lock;

  const save = (next: string[]) => {
    if (locked && !lockAllows(s.config.sites, next)) {
      return toast("Mode engagement : tu peux ajouter des sites, pas en retirer.", true);
    }
    s.updateConfig({ sites: [...new Set(next)].sort() });
  };

  const toggle = (site: string) =>
    save(selected.has(site) ? s.config.sites.filter((x) => x !== site) : [...s.config.sites, site]);

  const add = () => {
    const d = cleanDomain(adding);
    if (!d) return toast("Écris une adresse complète, par exemple lequipe.fr", true);
    setAdding("");
    if (selected.has(d)) return toast("Ce site est déjà coché.");
    save([...s.config.sites, d]);
    toast(`${d} ajouté`);
  };

  const catalog = new Set(Object.values(SITE_CATALOG).flat());
  const groups: [string, string[]][] = [["Mes sites", s.config.sites.filter((x) => !catalog.has(x))], ...Object.entries(SITE_CATALOG)];
  const q = query.trim().toLowerCase();

  return (
    <View style={{ gap: 14 }}>
      <PageHead eyebrow="Pendant les sessions" title="Sites web"
        text="Coche les sites qui te happent. Pendant une session, ils ne s'ouvrent plus, dans aucun navigateur ni aucune application." />

      {locked && <Banner icon="lock" title="Mode engagement actif" text="Tu peux ajouter des sites, pas en retirer avant la fin de la session." />}

      <View style={[styles.search, { backgroundColor: c.surface2, borderColor: c.borderStrong }]}>
        <Icon name="search" size={18} color={c.faint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un site" placeholderTextColor={c.faint}
          accessibilityLabel="Rechercher un site" autoCapitalize="none" autoCorrect={false}
          style={{ flex: 1, color: c.text, fontSize: 16, minHeight: 46 }} />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Effacer la recherche">
            <Icon name="x" size={18} color={c.muted} />
          </Pressable>
        ) : null}
      </View>

      {groups.map(([title, sites]) => {
        const shown = sites.filter((x) => !q || x.includes(q));
        if (!shown.length) return null;
        const n = shown.filter((x) => selected.has(x)).length;
        return (
          <View key={title} style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, marginTop: 6 }}>
              {title} <Text style={{ color: c.muted, fontWeight: "500" }}>{n}/{shown.length}</Text>
            </Text>
            {shown.map((site) => (
              <CheckRow key={site} title={site} checked={selected.has(site)} onPress={() => toggle(site)}
                disabled={locked && selected.has(site)} media={<Avatar text={site} />} />
            ))}
          </View>
        );
      })}
      {q && !groups.some(([, sites]) => sites.some((x) => x.includes(q))) && (
        <Helper style={{ textAlign: "center" }}>Aucun site ne correspond. Ajoute-le ci-dessous.</Helper>
      )}

      <View style={{ gap: 8, marginTop: 6 }}>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>Ajouter un site</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={adding} onChangeText={setAdding} placeholder="Ex. : lequipe.fr" placeholderTextColor={c.faint}
            accessibilityLabel="Adresse du site à ajouter" autoCapitalize="none" autoCorrect={false} keyboardType="url"
            returnKeyType="done" onSubmitEditing={add}
            style={[styles.input, { flex: 1, color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong }]} />
          <Button icon="plus" label="Ajouter" onPress={add} />
        </View>
        <Helper>
          Si un site reste accessible, ferme et rouvre son onglet. Si le « DNS privé » est réglé sur un fournisseur précis
          dans les réglages Android, choisis « Automatique » pour que le blocage s'applique.
        </Helper>
      </View>

      <View style={[styles.foot, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={{ color: c.text, flex: 1 }}>
          <Text style={{ fontWeight: "700" }}>{selected.size}</Text> {selected.size > 1 ? "sites bloqués" : "site bloqué"} pendant les sessions
        </Text>
        {!locked && selected.size > 0 && <Button small label="Tout décocher" onPress={() => save([])} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, fontSize: 16 },
  foot: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.sm, borderWidth: 1, marginTop: 6 },
});
