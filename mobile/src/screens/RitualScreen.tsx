import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { dayKey } from "../logic";
import { useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Button, Card, CheckRow, Helper, Icon, IconButton, PageHead, useToast } from "../ui";

/** Rituel de fin de journée (comme sur PC) : checklist, puis « Shutdown complete ». */
export function RitualScreen() {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const items = s.config.shutdownChecklist;
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<string[] | null>(null);
  const doneToday = s.config.lastShutdown === dayKey(new Date(s.now));
  const head = (
    <PageHead title="Rituel de fin de journée"
      text="Ton cerveau ne lâche prise que s'il sait que rien n'est oublié. Fais le tour, puis déclare ta journée terminée." />
  );

  if (editing) {
    return (
      <View style={{ gap: 14 }}>
        {head}
        <Card style={{ gap: 10 }}>
          {editing.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput value={t} maxLength={160} accessibilityLabel={`Étape ${i + 1}`}
                onChangeText={(v) => setEditing(editing.map((x, j) => (j === i ? v : x)))}
                style={[styles.input, { flex: 1, color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong }]} />
              <IconButton icon="trash" label={`Supprimer l'étape ${i + 1}`} color={c.muted}
                onPress={() => setEditing(editing.filter((_, j) => j !== i))} />
            </View>
          ))}
          <Button icon="plus" label="Ajouter une étape" onPress={() => setEditing([...editing, ""])} />
        </Card>
        <Button variant="primary" label="Enregistrer" onPress={() => {
          s.updateConfig({ shutdownChecklist: editing.map((x) => x.trim()).filter(Boolean) });
          setEditing(null);
          setChecked(new Set());
          toast("Rituel enregistré");
        }} />
        <Button label="Annuler" onPress={() => setEditing(null)} />
      </View>
    );
  }

  if (doneToday) {
    return (
      <View style={{ gap: 14 }}>
        {head}
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
          <View style={[styles.bigIco, { backgroundColor: c.successSoft }]}>
            <Icon name="check" size={28} stroke={2.4} color={c.success} />
          </View>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>Shutdown complete</Text>
          <Helper style={{ textAlign: "center" }}>
            Ta journée de travail est terminée. Déconnecte-toi vraiment : le repos fait partie du travail profond.
          </Helper>
          <Button small label="Refaire le rituel" style={{ marginTop: 10 }}
            onPress={() => { s.updateConfig({ lastShutdown: null }); setChecked(new Set()); }} />
        </Card>
      </View>
    );
  }

  const n = items.filter((_, i) => checked.has(i)).length;
  const all = items.length > 0 && n === items.length;
  return (
    <View style={{ gap: 14 }}>
      {head}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>{n} / {items.length}</Text>
        <View style={[styles.bar, { backgroundColor: c.surface3 }]}>
          <View style={{ width: `${items.length ? (n / items.length) * 100 : 0}%`, height: "100%", backgroundColor: c.accent }} />
        </View>
        <Button small icon="pencil" label="Modifier" onPress={() => setEditing([...items])} />
      </View>
      <View style={{ gap: 8 }}>
        {items.map((t, i) => (
          <CheckRow key={`${i}-${t}`} title={t} checked={checked.has(i)} onPress={() => {
            const next = new Set(checked);
            if (next.has(i)) next.delete(i); else next.add(i);
            setChecked(next);
          }} />
        ))}
      </View>
      <Button variant="primary" large icon="moon" label="Shutdown complete" disabled={!all}
        onPress={() => { s.updateConfig({ lastShutdown: dayKey(new Date()) }); setChecked(new Set()); }} />
      {!all && <Helper style={{ textAlign: "center" }}>Coche toutes les étapes pour terminer ta journée.</Helper>}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 46, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, fontSize: 15 },
  bar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  bigIco: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
