import { useEffect, useState } from "react";
import { Alert, AppState, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as Blocker from "../../modules/focus-blocker";
import { fmtClock, fmtDuration, fmtRemaining, plural } from "../format";
import { cleanPhrase, DEPTH_LABELS, DURATIONS, QUOTES } from "../logic";
import { abandonPhrase, activeList, useAppState } from "../state";
import { radius, useColors } from "../theme";
import { Banner, Button, Card, Chip, Eyebrow, Helper, Icon, Label, Link, PageHead, ToggleRow, useToast } from "../ui";

type Nav = { goApps: () => void; goSites: () => void; goProgress: () => void };

const appsSummary = (mode: Blocker.BlockMode, n: number) =>
  mode === "allow"
    ? n ? `${plural(n, "application autorisée", "applications autorisées")}, tout le reste bloqué` : "Tout bloqué sauf le téléphone"
    : plural(n, "application sélectionnée", "applications sélectionnées");

export function SessionScreen(nav: Nav) {
  const s = useAppState();
  if (s.live) return <LiveView />;
  if (s.review) return <ReviewView goProgress={nav.goProgress} />;
  return <NewSession {...nav} />;
}

/** Autorisations du téléphone, revérifiées au retour des réglages. */
export function usePermissions() {
  const read = () => ({
    service: Blocker.isServiceEnabled(),
    silence: Blocker.isSilenceAllowed(),
    vpn: Blocker.isVpnAllowed(),
  });
  const [p, setP] = useState(read);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setP(read()));
    return () => sub.remove();
  }, []);
  return p;
}

function BlockerSetup() {
  const c = useColors();
  return (
    <Card style={{ borderColor: c.accentLine, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <Icon name="shield" color={c.accent} />
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, flex: 1 }}>Active le blocage des applications (une seule fois)</Text>
      </View>
      <Helper>
        1. Ouvre les réglages d'accessibilité.{"\n"}
        2. Touche « Applications installées » puis « OpusFocus — blocage ».{"\n"}
        3. Active-le et confirme.
      </Helper>
      <Helper style={{ marginTop: 8 }}>
        Si l'interrupteur est grisé (« paramètre restreint »), ouvre la fiche de l'app, touche ⋮ en haut à droite puis
        « Autoriser les paramètres restreints », et recommence.
      </Helper>
      <View style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" label="Ouvrir l'accessibilité" onPress={Blocker.openAccessibilitySettings} />
        <Button label="Fiche de l'application" onPress={Blocker.openAppSettings} />
      </View>
    </Card>
  );
}

function NewSession({ goApps, goSites }: Nav) {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const perms = usePermissions();
  const [intention, setIntention] = useState("");
  const [minutes, setMinutes] = useState(s.config.minutes);
  const [custom, setCustom] = useState(!DURATIONS.includes(s.config.minutes));
  const [customText, setCustomText] = useState(String(s.config.minutes));
  const [notif, setNotif] = useState(s.config.notif);
  const [apps, setApps] = useState(s.config.blockApps);
  const [sites, setSites] = useState(s.config.blockSites);
  const [lock, setLock] = useState(s.config.lock);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const valid = minutes >= 5 && minutes <= 480;
  const native = Blocker.blockerAvailable;

  const go = async () => {
    let blockSites = sites && native;
    // Notification de fin de session (Android 13+) : demandée une fois, au premier démarrage.
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    }
    if (blockSites && !Blocker.isVpnAllowed()) {
      // Android affiche sa propre demande de connexion VPN (une seule fois).
      if (!(await Blocker.prepareVpn())) {
        blockSites = false;
        toast("Sites non bloqués : la connexion VPN d'OpusFocus a été refusée.", true);
      }
    }
    const warnings = s.start({ intention: intention.trim(), minutes, notif: notif && native, apps: apps && native, sites: blockSites, lock });
    if (warnings.length) toast(warnings.join(" "), true);
  };

  const start = () => {
    if (!intention.trim()) return setError("Écris ce que tu vas accomplir : une session sans objectif précis reste du travail superficiel.");
    if (!valid) return setError("Choisis une durée entre 5 minutes et 8 heures.");
    const run = () => {
      setBusy(true);
      go().finally(() => setBusy(false));
    };
    // Relu au moment de commencer : l'utilisateur vient peut-être de l'activer.
    if (native && apps && !Blocker.isServiceEnabled() && (s.config.mode === "allow" || s.config.apps.length)) {
      Alert.alert("Blocage des applications non activé", "Les applications ne seront pas bloquées pendant cette session.", [
        { text: "Annuler", style: "cancel" },
        { text: "Commencer quand même", onPress: run },
      ]);
    } else run();
  };

  const notifDesc = !native ? "Disponible dans l'application installée."
    : perms.silence ? "Le mode « Ne pas déranger » reste actif jusqu'à la fin."
      : <>« Ne pas déranger » doit être autorisé · <Link label="Autoriser" onPress={Blocker.openSilenceSettings} /></>;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ marginBottom: 6 }}>
        <Eyebrow>Nouvelle session</Eyebrow>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: "700", marginTop: 4, letterSpacing: -0.3 }}>Sur quoi vas-tu te concentrer ?</Text>
        <Text style={{ color: c.muted, fontStyle: "italic", marginTop: 6, lineHeight: 20 }}>« {quote} »</Text>
      </View>

      <Card>
        <Label>Ton intention</Label>
        <TextInput
          value={intention}
          onChangeText={(t) => { setIntention(t); if (error) setError(""); }}
          placeholder="Ex. : rédiger l'introduction du mémoire"
          placeholderTextColor={c.faint}
          maxLength={200}
          returnKeyType="go"
          onSubmitEditing={start}
          accessibilityLabel="Ton intention"
          style={[styles.input, { color: c.text, backgroundColor: c.surface2, borderColor: error ? c.danger : c.borderStrong }]}
        />
        {error ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, alignItems: "flex-start" }}>
            <Icon name="alert" size={16} color={c.danger} />
            <Text style={{ color: c.danger, fontSize: 13, flex: 1 }}>{error}</Text>
          </View>
        ) : (
          <Helper style={{ marginTop: 8 }}>Une seule tâche, précise et réalisable dans la session.</Helper>
        )}
      </Card>

      <Card>
        <Label>Durée</Label>
        <View style={styles.chips}>
          {DURATIONS.map((m) => (
            <Chip key={m} label={fmtDuration(m)} selected={!custom && minutes === m}
              onPress={() => { setCustom(false); setMinutes(m); }} />
          ))}
          <Chip label="Autre" selected={custom} onPress={() => { setCustom(true); setMinutes(parseInt(customText, 10) || 0); }} />
        </View>
        {custom && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <TextInput
              value={customText}
              onChangeText={(t) => { const v = t.replace(/[^0-9]/g, ""); setCustomText(v); setMinutes(parseInt(v, 10) || 0); }}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Durée en minutes"
              style={[styles.input, { width: 90, textAlign: "center", color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong }]}
            />
            <Text style={{ color: c.muted }}>minutes</Text>
          </View>
        )}
        <Helper style={{ marginTop: 10 }}>
          {valid
            ? `${minutes >= 60 ? `${fmtDuration(minutes)} · ` : ""}Fin prévue à ${fmtClock(s.now + minutes * 60000)}`
            : "Entre 5 minutes et 8 heures."}
        </Helper>
      </Card>

      <Card>
        <Label>Protection</Label>
        <ToggleRow icon="bellOff" title="Couper les notifications" value={notif} onChange={setNotif} disabled={!native} desc={notifDesc} />
        <ToggleRow icon="grid" title={s.config.mode === "allow" ? "Seulement mes applications" : "Bloquer les applications"}
          value={apps} onChange={setApps} disabled={!native}
          desc={<>{appsSummary(s.config.mode, activeList(s.config).length)} · <Link label="Modifier" onPress={goApps} /></>} />
        <ToggleRow icon="globe" title="Bloquer les sites web" value={sites} onChange={setSites} disabled={!native}
          desc={<>{plural(s.config.sites.length, "site sélectionné", "sites sélectionnés")} · <Link label="Modifier" onPress={goSites} /></>} />
        <ToggleRow icon="lock" title="Mode engagement" value={lock} onChange={setLock}
          desc="Pour arrêter avant la fin, il faudra taper une phrase d'abandon. Tu pourras ajouter des blocages, pas en retirer." />
      </Card>

      {!native && (
        <Banner icon="alert" title="Blocage indisponible ici"
          text="Les blocages fonctionnent dans l'application Android installée (fichier .apk), pas dans Expo Go." />
      )}
      {native && apps && !perms.service && <BlockerSetup />}

      <Button variant="primary" large icon="timer" disabled={busy}
        label={`Commencer · ${valid ? fmtDuration(minutes) : `${minutes} min`}`} onPress={start} />
    </View>
  );
}

function Ring({ progress, size }: { progress: number; size: number }) {
  const c = useColors();
  const stroke = 10, r = (size - stroke) / 2, len = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface3} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.accent} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${len}`} strokeDashoffset={len * (1 - Math.min(1, Math.max(0, progress)))} />
    </Svg>
  );
}

function Pill({ icon, text }: { icon: string; text: string }) {
  const c = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: c.surface2, borderColor: c.border }]}>
      <Icon name={icon} size={15} color={c.accent} />
      <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>{text}</Text>
    </View>
  );
}

function LiveView() {
  const c = useColors();
  const s = useAppState();
  const perms = usePermissions();
  const [asking, setAsking] = useState(false);
  const live = s.live!;
  const left = live.endAt - s.now;
  const total = live.endAt - live.startedAt;
  const st = s.status;
  const fresh = !!st.lastBlocked && s.now - st.lastBlockedAt < 10_000;

  const pills: [string, string][] = [];
  if (live.notif) pills.push(["bellOff", "Notifications coupées"]);
  if (live.apps) {
    pills.push(["grid", s.config.mode === "allow"
      ? plural(s.config.allowed.length, "application autorisée", "applications autorisées")
      : plural(s.config.apps.length, "application bloquée", "applications bloquées")]);
  }
  if (live.sites) pills.push(["globe", plural(s.config.sites.length, "site bloqué", "sites bloqués")]);
  if (live.lock) pills.push(["lock", "Mode engagement"]);

  const stop = () => {
    if (live.lock) return setAsking(true);
    Alert.alert("Arrêter la session ?", "Le temps déjà travaillé sera comptabilisé. Les blocages seront levés tout de suite.", [
      { text: "Continuer à travailler", style: "cancel" },
      { text: "Arrêter", style: "destructive", onPress: () => s.finish(false) },
    ]);
  };

  return (
    <View style={{ alignItems: "center", gap: 12, paddingTop: 8 }}>
      <View style={{ width: 260, height: 260, alignItems: "center", justifyContent: "center", marginVertical: 6 }}
        accessible accessibilityRole="timer" accessibilityLabel={`Temps restant ${fmtRemaining(left)}`}>
        <Ring progress={1 - left / total} size={260} />
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.text, fontSize: 52, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{fmtRemaining(left)}</Text>
            <Text style={{ color: c.muted, marginTop: 2 }}>restantes</Text>
          </View>
        </View>
      </View>
      <Eyebrow>En train de travailler sur</Eyebrow>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>{live.intention}</Text>
      <Helper>Commencée à {fmtClock(live.startedAt)} · fin à {fmtClock(live.endAt)}</Helper>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
        {pills.length ? pills.map(([i, t]) => <Pill key={t} icon={i} text={t} />) : <Pill icon="shield" text="Aucun blocage actif" />}
      </View>

      <View style={{ minHeight: 44, justifyContent: "center", alignSelf: "stretch" }} accessibilityLiveRegion="polite">
        {fresh ? (
          <Banner icon="shield" title={`${st.lastBlocked} a été bloquée.`} text="Reviens à ta tâche." />
        ) : st.blockedCount ? (
          <Helper style={{ textAlign: "center" }}>{plural(st.blockedCount, "distraction bloquée", "distractions bloquées")} pendant cette session</Helper>
        ) : null}
      </View>

      {live.apps && Blocker.blockerAvailable && !perms.service && (
        <Banner tone="danger" icon="alert" title="Le blocage des applications est désactivé"
          text="Réactive « OpusFocus — blocage » dans les réglages d'accessibilité."
          action={<Button small label="Ouvrir l'accessibilité" onPress={Blocker.openAccessibilitySettings} />} />
      )}
      {live.sites && st.active && !st.sites && (
        <Banner tone="danger" icon="alert" title="Les sites ne sont plus bloqués"
          text="La connexion VPN d'OpusFocus a été coupée. Elle reprendra à la prochaine session." />
      )}

      <Button style={{ alignSelf: "stretch", marginTop: 6 }} variant="ghost" icon="x" label="Arrêter la session" onPress={stop} />
      <Helper style={{ textAlign: "center" }}>
        Tu peux quitter l'application : la protection continue, et OpusFocus te prévient à la fin.
      </Helper>
      <AbandonModal phrase={abandonPhrase(s)} visible={asking} onClose={() => setAsking(false)} onConfirm={() => { setAsking(false); s.finish(false); }} />
    </View>
  );
}

function AbandonModal({ phrase, visible, onClose, onConfirm }: {
  phrase: string; visible: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState("");
  const ok = cleanPhrase(text) === phrase;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => setText("")}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>Tu t'es engagé à aller jusqu'au bout</Text>
          <Helper style={{ marginTop: 6 }}>
            Respire. L'envie d'arrêter fait partie de l'entraînement. Pour abandonner quand même, tape la phrase ci-dessous.
          </Helper>
          <Text selectable={false} style={[styles.phrase, { color: c.text, backgroundColor: c.surface2 }]}>{phrase}</Text>
          <TextInput value={text} onChangeText={setText} autoCorrect={false} autoCapitalize="none" contextMenuHidden
            accessibilityLabel={`Phrase d'abandon : ${phrase}`}
            placeholder="Tape la phrase ici" placeholderTextColor={c.faint}
            style={[styles.input, { color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong }]} />
          <View style={{ gap: 8, marginTop: 16 }}>
            <Button variant="primary" label="Je reprends le travail" onPress={onClose} />
            <Button variant="danger" label="Abandonner" disabled={!ok} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Bilan de fin de session (comme la fenêtre de bilan sur PC). */
function ReviewView({ goProgress }: { goProgress: () => void }) {
  const c = useColors();
  const s = useAppState();
  const toast = useToast();
  const d = s.history.find((r) => r.id === s.review);
  const [depth, setDepth] = useState<number | null>(null);
  const [note, setNote] = useState("");
  if (!d) return null;
  const save = (withData: boolean) => {
    s.saveReview(d.id, withData ? depth : null, withData ? note : "");
    if (withData) toast("Bilan enregistré.");
    goProgress();
  };
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <PageHead eyebrow="Bilan" title={d.completed ? "Session terminée. Bien joué." : "Session interrompue"}
        text={`${fmtDuration(Math.round(d.actualMin))} sur « ${d.intention} »${d.blocked ? ` · ${plural(d.blocked, "distraction bloquée", "distractions bloquées")}` : ""}`} />
      <Card>
        <Label>À quel point étais-tu concentré ?</Label>
        <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="radiogroup">
          {DEPTH_LABELS.map((l, i) => {
            const on = depth === i + 1;
            return (
              <Pressable key={l} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${i + 1}, ${l}`}
                onPress={() => setDepth(i + 1)}
                style={[styles.depth, { backgroundColor: on ? c.accentSoft : c.surface2, borderColor: on ? c.accent : c.borderStrong }]}>
                <Text style={{ color: on ? c.accent : c.text, fontSize: 20, fontWeight: "700" }}>{i + 1}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: c.muted, fontSize: 10 }}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
        <Label style={{ marginTop: 18 }}>Note <Text style={{ color: c.muted, fontWeight: "400" }}>(facultatif)</Text></Label>
        <TextInput value={note} onChangeText={setNote} maxLength={500} multiline
          placeholder="Ce qui a marché, ce qui t'a distrait…" placeholderTextColor={c.faint}
          accessibilityLabel="Note"
          style={[styles.input, { minHeight: 90, paddingTop: 12, textAlignVertical: "top", color: c.text, backgroundColor: c.surface2, borderColor: c.borderStrong }]} />
      </Card>
      <Button variant="primary" large label="Enregistrer le bilan" onPress={() => save(true)} />
      <Button label="Passer" onPress={() => save(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 32, borderRadius: 999, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(5,6,8,0.6)", justifyContent: "center", padding: 20 },
  sheet: { borderRadius: radius.lg, borderWidth: 1, padding: 22 },
  phrase: { fontWeight: "600", padding: 12, borderRadius: 8, marginVertical: 12 },
  depth: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, gap: 2 },
});
