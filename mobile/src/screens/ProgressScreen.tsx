import { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { fmtClock, fmtDay, fmtDuration, fmtHours } from "../format";
import { averageDepth, completionRate, streak, weekStats } from "../logic";
import { SessionRecord, useAppState } from "../state";
import { useColors } from "../theme";
import { Button, Card, Helper, Icon, Label, PageHead } from "../ui";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function ProgressScreen({ goSession }: { goSession: () => void }) {
  const c = useColors();
  const s = useAppState();
  const goal = s.config.weeklyGoalHours;

  const stats = useMemo(() => {
    const w = weekStats(s.history, s.now);
    return { w, streak: streak(s.history, s.now), depth: averageDepth(s.history), done: completionRate(s.history) };
  }, [s.history, s.now]);

  const pct = Math.min(100, (stats.w.total / 60 / goal) * 100);
  const setGoal = (h: number) => s.updateConfig({ weeklyGoalHours: Math.max(1, Math.min(80, h)) });

  return (
    <View style={{ gap: 14 }}>
      <PageHead title="Tableau de score"
        text="Mesure tes heures de travail profond, pas tes résultats : c'est l'indicateur que tu contrôles vraiment." />

      <View style={styles.kpis}>
        <Kpi icon="timer" label="Cette semaine" value={`${fmtHours(stats.w.total)} h`} unit={`/ ${goal} h`}>
          <View style={[styles.bar, { backgroundColor: c.surface3 }]} accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
            <View style={{ width: `${pct}%`, height: "100%", backgroundColor: c.accent, borderRadius: 3 }} />
          </View>
        </Kpi>
        <Kpi icon="flame" label="Série" value={String(stats.streak)} unit={stats.streak > 1 ? "jours" : "jour"}
          sub={stats.streak ? "Jours consécutifs avec du deep work" : "Fais une session aujourd'hui pour la lancer"} />
        <Kpi icon="layers" label="Profondeur moyenne" value={stats.depth.avg ? stats.depth.avg.toFixed(1).replace(".", ",") : "–"} unit="/ 5"
          sub={stats.depth.count ? `Sur ${stats.depth.count > 1 ? `tes ${stats.depth.count} dernières sessions notées` : "ta session notée"}` : "Note tes sessions à la fin"} />
        <Kpi icon="check" label="Sessions" value={String(s.history.length)}
          sub={s.history.length ? `${stats.done} % menées à terme` : "Aucune pour l'instant"} />
      </View>

      <Card>
        <View style={styles.chartHead}>
          <Label style={{ marginBottom: 0 }}>Heures par jour</Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Step icon="minus" label="Diminuer l'objectif" onPress={() => setGoal(goal - 1)} />
            <Text style={{ color: c.text, fontWeight: "700", minWidth: 44, textAlign: "center" }}>{goal} h</Text>
            <Step icon="plus" label="Augmenter l'objectif" onPress={() => setGoal(goal + 1)} />
          </View>
        </View>
        <Helper style={{ marginBottom: 8, textAlign: "right" }}>Objectif hebdomadaire</Helper>
        <WeekChart perDay={stats.w.perDay} todayIdx={stats.w.todayIdx} goal={goal} />
      </Card>

      <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, marginTop: 4 }}>
        Historique <Text style={{ color: c.muted, fontWeight: "500" }}>{s.history.length}</Text>
      </Text>
      <Card style={{ paddingVertical: 4 }}>
        {s.history.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 20, gap: 12 }}>
            <Icon name="timer" size={26} color={c.faint} />
            <Helper>Ta première session apparaîtra ici.</Helper>
            <Button variant="primary" label="Commencer une session" onPress={goSession} />
          </View>
        ) : (
          s.history.slice(0, 40).map((r, i) => <HistoryRow key={r.id} r={r} first={i === 0} />)
        )}
      </Card>
    </View>
  );
}

function Kpi({ icon, label, value, unit, sub, children }: {
  icon: string; label: string; value: string; unit?: string; sub?: string; children?: ReactNode;
}) {
  const c = useColors();
  return (
    <Card style={{ flexBasis: "46%", flexGrow: 1, padding: 14, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={15} color={c.muted} />
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      </View>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>
        {value}
        {unit ? <Text style={{ color: c.muted, fontSize: 14, fontWeight: "400" }}>{` ${unit}`}</Text> : null}
      </Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 12, lineHeight: 16 }}>{sub}</Text> : null}
      {children}
    </Card>
  );
}

/** Barres par jour et ligne d'objectif quotidien (objectif hebdomadaire réparti sur 5 jours), comme sur PC. */
function WeekChart({ perDay, todayIdx, goal }: { perDay: number[]; todayIdx: number; goal: number }) {
  const c = useColors();
  const W = 340, H = 190, top = 24, bottom = 26;
  const daily = (goal * 60) / 5;
  const max = Math.max(...perDay, daily, 60);
  const slot = W / 7, bw = Math.min(30, slot * 0.55);
  const y = (v: number) => H - bottom - ((H - top - bottom) * v) / max;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Heures de deep work par jour cette semaine">
      <Line x1={0} x2={W} y1={y(daily)} y2={y(daily)} stroke={c.accentLine} strokeDasharray="4 5" />
      <SvgText x={W} y={y(daily) - 5} fill={c.muted} fontSize={10} textAnchor="end">{`Objectif du jour ${fmtHours(daily)} h`}</SvgText>
      {perDay.map((m, i) => {
        const cx = slot * i + slot / 2;
        return (
          <G key={i}>
            {m > 0 ? (
              <>
                <Rect x={cx - bw / 2} y={y(m)} width={bw} height={Math.max(H - bottom - y(m), 2)} rx={4}
                  fill={m >= daily ? c.accent : c.accentLine} />
                <SvgText x={cx} y={y(m) - 5} fill={c.muted} fontSize={10} textAnchor="middle">{`${fmtHours(m)} h`}</SvgText>
              </>
            ) : (
              <Rect x={cx - bw / 2} y={H - bottom - 2} width={bw} height={2} rx={1} fill={c.surface3} />
            )}
            <SvgText x={cx} y={H - 8} fill={i === todayIdx ? c.accent : c.muted} fontSize={11}
              fontWeight={i === todayIdx ? "700" : "400"} textAnchor="middle">{DAYS[i]}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function HistoryRow({ r, first }: { r: SessionRecord; first: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.hRow, { borderTopColor: c.border, borderTopWidth: first ? 0 : 1 }]}>
      <View style={[styles.st, { backgroundColor: r.completed ? c.successSoft : c.dangerSoft }]}
        accessibilityLabel={r.completed ? "Terminée" : "Interrompue"}>
        <Icon name={r.completed ? "check" : "x"} size={14} stroke={2.6} color={r.completed ? c.success : c.danger} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: c.text, fontWeight: "600" }}>{r.intention}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={{ color: c.faint, fontSize: 12 }}>{fmtDay(r.startedAt)} à {fmtClock(r.startedAt)} · profondeur</Text>
          {r.depth ? (
            <View style={{ flexDirection: "row", gap: 3 }} accessibilityLabel={`Profondeur ${r.depth} sur 5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i <= (r.depth ?? 0) ? c.accent : c.surface3 }]} />
              ))}
            </View>
          ) : <Text style={{ color: c.faint, fontSize: 12 }}>non notée</Text>}
        </View>
        {r.note ? <Text style={{ color: c.muted, fontSize: 13, fontStyle: "italic" }}>{r.note}</Text> : null}
      </View>
      <Text style={{ color: c.muted, fontVariant: ["tabular-nums"] }}>{fmtDuration(Math.round(r.actualMin))}</Text>
    </View>
  );
}

function Step({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.step, { borderColor: c.borderStrong, backgroundColor: c.surface2, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={16} color={c.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  chartHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  st: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  step: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
