import { useEffect, useState } from "react";
import { AppState, PermissionsAndroid, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import * as Blocker from "../../modules/focus-blocker";
import { cleanPhrase, PHRASE_MAX, PHRASE_MIN } from "../logic";
import { abandonPhrase, useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Button, Card, Helper, Icon, PageHead, ToggleRow, useToast } from "../ui";

type Perms = { service: boolean; silence: boolean; vpn: boolean; notifications: boolean };

async function readPerms(): Promise<Perms> {
  const notifications = Platform.OS === "android" && Number(Platform.Version) >= 33
    ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => false)
    : true;
  return { service: Blocker.isServiceEnabled(), silence: Blocker.isSilenceAllowed(), vpn: Blocker.isVpnAllowed(), notifications };
}

export function SettingsScreen() {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const [perms, setPerms] = useState<Perms | null>(null);

  useEffect(() => {
    const refresh = () => { readPerms().then(setPerms).catch(() => undefined); };
    refresh();
    const sub = AppState.addEventListener("change", (st) => st === "active" && refresh());
    return () => sub.remove();
  }, []);

  return (
    <View style={{ gap: 14 }}>
      <PageHead title="Réglages" text="OpusFocus enregistre chaque changement tout de suite." />

      <Card style={{ paddingVertical: 6 }}>
        <ToggleRow icon="power" title="Ouvrir OpusFocus au démarrage" value={s.config.openAtBoot}
          onChange={(v) => { s.updateConfig({ openAtBoot: v }); toast("Enregistré"); }}
          desc="L'application s'ouvre quand le téléphone redémarre. Une session en cours reprend toujours, même sans ce réglage." />
        <ToggleRow icon="music" title="Lancer la musique avec la session" value={s.config.musicAutoplay}
          onChange={(v) => { s.updateConfig({ musicAutoplay: v }); toast("Enregistré"); }}
          desc="La musique démarre au début de chaque session et s'arrête à la fin." />
      </Card>

      <PhraseCard />

      <Text style={{ fontWeight: "700", fontSize: 16, color: c.text, marginTop: 4 }}>Autorisations</Text>
      {!Blocker.blockerAvailable ? (
        <Helper>Les autorisations se règlent dans l'application Android installée.</Helper>
      ) : perms ? (
        <View style={{ gap: 10 }}>
          <Perm ok={perms.service} title="Blocage des applications" desc="Service d'accessibilité « OpusFocus — blocage »."
            action="Ouvrir l'accessibilité" onPress={Blocker.openAccessibilitySettings} />
          <Perm ok={perms.silence} title="Couper les notifications" desc="Accès au mode « Ne pas déranger »."
            action="Autoriser" onPress={Blocker.openSilenceSettings} />
          <Perm ok={perms.vpn} title="Bloquer les sites web" desc="Connexion VPN locale : seules les adresses des sites passent par OpusFocus, rien ne quitte le téléphone."
            action="Autoriser" onPress={async () => {
              if (await Blocker.prepareVpn()) toast("Blocage des sites autorisé");
              setPerms(await readPerms());
            }} />
          <Perm ok={perms.notifications} title="Notification de fin de session" desc="Pour te prévenir quand la session est terminée."
            action="Autoriser" onPress={async () => {
              const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => null);
              if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) Blocker.openAppSettings();
              setPerms(await readPerms());
            }} />
        </View>
      ) : null}
    </View>
  );
}

function Perm({ ok, title, desc, action, onPress }: { ok: boolean; title: string; desc: string; action: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Card style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name={ok ? "check" : "alert"} size={18} color={ok ? c.success : c.accent} />
        <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>{title}</Text>
        <Text style={{ color: ok ? c.success : c.muted, fontSize: 12, fontWeight: "600" }}>{ok ? "Activé" : "À autoriser"}</Text>
      </View>
      <Helper>{desc}</Helper>
      {!ok && <Button small label={action} onPress={onPress} style={{ alignSelf: "flex-start" }} />}
    </Card>
  );
}

/** Phrase d'abandon personnalisée (mode engagement), comme sur PC. */
function PhraseCard() {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const current = abandonPhrase(s);
  const [text, setText] = useState(current);
  const locked = !!s.live?.lock;
  const save = () => {
    const phrase = cleanPhrase(text);
    if (phrase.length < PHRASE_MIN || phrase.length > PHRASE_MAX) {
      return toast(`La phrase doit faire entre ${PHRASE_MIN} et ${PHRASE_MAX} caractères.`, true);
    }
    s.updateConfig({ abandonPhrase: phrase });
    setText(phrase);
    toast("Phrase d'abandon enregistrée");
  };
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: c.text, fontWeight: "700", fontSize: 15 }}>Phrase d'abandon</Text>
      <Helper>
        En mode engagement, c'est la phrase à recopier pour arrêter une session avant la fin. Choisis-en une qui te fasse réfléchir.
      </Helper>
      <TextInput value={text} onChangeText={setText} editable={!locked} maxLength={PHRASE_MAX} multiline
        autoCorrect={false} autoCapitalize="none" accessibilityLabel="Phrase d'abandon"
        style={[styles.input, { color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong, opacity: locked ? 0.6 : 1 }]} />
      {locked ? (
        <Helper style={{ color: c.accent }}>Mode engagement en cours : la phrase se change après la session.</Helper>
      ) : (
        <Button small icon="check" label="Enregistrer" disabled={cleanPhrase(text) === current} onPress={save}
          style={{ alignSelf: "flex-start" }} />
      )}
      <Helper>Entre {PHRASE_MIN} et {PHRASE_MAX} caractères. Majuscules et espaces en trop ne comptent pas.</Helper>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
});
