import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg";
import { radius, useColors } from "./theme";

// --- Icônes (tracés Lucide, les mêmes que sur PC) ------------------------------------------------
const PATHS: Record<string, ReactNode> = {
  timer: (<><Line x1="10" x2="14" y1="2" y2="2" /><Line x1="12" x2="15" y1="14" y2="11" /><Circle cx="12" cy="14" r="8" /></>),
  grid: (<><Rect width="7" height="7" x="3" y="3" rx="1" /><Rect width="7" height="7" x="14" y="3" rx="1" /><Rect width="7" height="7" x="14" y="14" rx="1" /><Rect width="7" height="7" x="3" y="14" rx="1" /></>),
  globe: (<><Circle cx="12" cy="12" r="10" /><Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><Path d="M2 12h20" /></>),
  chart: (<><Path d="M3 3v18h18" /><Path d="M18 17V9" /><Path d="M13 17V5" /><Path d="M8 17v-3" /></>),
  moon: <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  book: (<><Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>),
  bellOff: (<><Path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" /><Path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><Path d="m2 2 20 20" /></>),
  lock: (<><Rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  search: (<><Circle cx="11" cy="11" r="8" /><Path d="m21 21-4.3-4.3" /></>),
  check: <Path d="M20 6 9 17l-5-5" />,
  x: (<><Path d="M18 6 6 18" /><Path d="m6 6 12 12" /></>),
  shield: (<><Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><Path d="m9 12 2 2 4-4" /></>),
  plus: (<><Path d="M5 12h14" /><Path d="M12 5v14" /></>),
  minus: <Path d="M5 12h14" />,
  alert: (<><Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><Path d="M12 9v4" /><Path d="M12 17h.01" /></>),
  flame: <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  layers: (<><Path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><Path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><Path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></>),
  sparkle: (<><Path d="M9.94 14.06 4 20" /><Path d="m12 3 1.9 5.8L20 10l-5.4 2.6L12 18l-1.9-5.4L4 10l6.1-1.2z" /></>),
  pencil: <Path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />,
  trash: (<><Path d="M3 6h18" /><Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>),
  music: (<><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></>),
  play: <Polygon points="6 3 20 12 6 21 6 3" />,
  pause: (<><Rect x="14" y="4" width="4" height="16" rx="1" /><Rect x="6" y="4" width="4" height="16" rx="1" /></>),
  skipBack: (<><Polygon points="19 20 9 12 19 4 19 20" /><Line x1="5" x2="5" y1="19" y2="5" /></>),
  skipForward: (<><Polygon points="5 4 15 12 5 20 5 4" /><Line x1="19" x2="19" y1="5" y2="19" /></>),
  folder: <Path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  gear: (<><Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><Circle cx="12" cy="12" r="3" /></>),
  power: (<><Path d="M12 2v10" /><Path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>),
  more: (<><Circle cx="12" cy="12" r="1" /><Circle cx="19" cy="12" r="1" /><Circle cx="5" cy="12" r="1" /></>),
  chevron: <Path d="m9 18 6-6-6-6" />,
  back: <Path d="m15 18-6-6 6-6" />,
};

export function Icon({ name, size = 20, color, stroke = 1.8 }: { name: string; size?: number; color: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}

// --- Briques -----------------------------------------------------------------------------------
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: 18 }, style]}>
      {children}
    </View>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ color: c.text, fontWeight: "600", fontSize: 15, marginBottom: 10 }, style]}>{children}</Text>;
}

export function Helper({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 13, lineHeight: 19 }, style]}>{children}</Text>;
}

/** Texte souligné qui se touche comme un lien (à placer dans un <Text>). */
export function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Text accessibilityRole="link" onPress={onPress} suppressHighlighting
      style={{ color: c.accent, textDecorationLine: "underline" }}>{label}</Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  icon?: string;
  large?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = "ghost", icon, large, small, disabled, style }: ButtonProps) {
  const c = useColors();
  const bg = variant === "primary" ? c.accent : variant === "danger" ? c.dangerSoft : c.surface2;
  const fg = variant === "primary" ? c.onAccent : variant === "danger" ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, minHeight: large ? 56 : small ? 38 : 46, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        small && { paddingHorizontal: 12 },
        variant === "ghost" && { borderWidth: 1, borderColor: c.borderStrong },
        style,
      ]}>
      {icon ? <Icon name={icon} size={large ? 20 : small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "700", fontSize: large ? 17 : small ? 14 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, size = 20, color }: { icon: string; label: string; onPress: () => void; size?: number; color?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Toggle({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => onChange(!value)}
      style={[styles.switch, { backgroundColor: value ? c.accent : c.surface3, opacity: disabled ? 0.5 : 1 }]}>
      <View style={[styles.knob, { backgroundColor: value ? c.onAccent : c.faint, transform: [{ translateX: value ? 20 : 0 }] }]} />
    </Pressable>
  );
}

export function ToggleRow({ icon, title, desc, value, onChange, disabled }: {
  icon: string; title: string; desc: ReactNode; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  const c = useColors();
  const on = value && !disabled;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIco, { backgroundColor: on ? c.accentSoft : c.surface2 }]}>
        <Icon name={icon} size={19} color={on ? c.accent : c.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{desc}</Text>
      </View>
      <Toggle value={on} onChange={onChange} disabled={disabled} label={title} />
    </View>
  );
}

export function Chip({ label, selected, onPress, count }: { label: string; selected: boolean; onPress: () => void; count?: number }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, {
        backgroundColor: selected ? c.accentSoft : c.surface2,
        borderColor: selected ? c.accent : c.borderStrong,
      }]}>
      <Text style={{ color: selected ? c.accent : c.text, fontWeight: "700", fontSize: 14 }}>
        {label}
        {count !== undefined ? <Text style={{ color: c.muted, fontWeight: "500" }}>{`  ${count}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

/** Case à cocher sur une ligne entière (applications, sites, rituel). */
export function CheckRow({ title, sub, checked, disabled, onPress, media, tag }: {
  title: string; sub?: string; checked: boolean; disabled?: boolean; onPress: () => void; media?: ReactNode; tag?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.check, {
        backgroundColor: checked ? c.accentSoft : c.surface,
        borderColor: checked ? c.accentLine : c.border,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      }]}>
      <View style={[styles.box, { borderColor: checked ? c.accent : c.faint, backgroundColor: checked ? c.accent : "transparent" }]}>
        {checked && <Icon name="check" size={14} stroke={3} color={c.onAccent} />}
      </View>
      {media}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: c.text, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: c.faint, fontSize: 12 }}>{sub}</Text> : null}
      </View>
      {tag}
    </Pressable>
  );
}

/** Pastille de couleur avec l'initiale (sites), comme sur PC. */
export function Avatar({ text }: { text: string }) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <View style={[styles.avatar, { backgroundColor: `hsl(${h}, 32%, 42%)` }]}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>{(text.replace(/^www\./, "")[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

export function Banner({ icon, title, text, action, tone = "accent" }: {
  icon: string; title: string; text?: string; action?: ReactNode; tone?: "accent" | "danger";
}) {
  const c = useColors();
  const color = tone === "danger" ? c.danger : c.accent;
  return (
    <View style={[styles.banner, { backgroundColor: tone === "danger" ? c.dangerSoft : c.accentSoft, borderColor: tone === "danger" ? c.danger : c.accentLine }]}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Icon name={icon} size={18} color={color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: tone === "danger" ? c.danger : c.text, fontWeight: "700" }}>{title}</Text>
          {text ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{text}</Text> : null}
        </View>
      </View>
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 12, letterSpacing: 1.2, fontWeight: "600", textTransform: "uppercase" }}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 26, fontWeight: "700", marginTop: 4, letterSpacing: -0.3 }}>{children}</Text>;
}

export function PageHead({ eyebrow, title, text }: { eyebrow?: string; title: string; text?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 6 }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Title>{title}</Title>
      {text ? <Text style={{ color: c.muted, marginTop: 6, lineHeight: 20 }}>{text}</Text> : null}
    </View>
  );
}

/** Barre réglable au doigt (position dans la piste, volume). `value` entre 0 et 1. */
export function Slider({ value, onChange, onDone, label }: {
  value: number; onChange: (v: number) => void; onDone?: (v: number) => void; label: string;
}) {
  const c = useColors();
  const width = useRef(1);
  const at = (x: number) => Math.min(1, Math.max(0, x / width.current));
  const v = Math.min(1, Math.max(0, value || 0));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next = Math.min(1, Math.max(0, v + (e.nativeEvent.actionName === "increment" ? 0.05 : -0.05)));
        onChange(next);
        onDone?.(next);
      }}
      onLayout={(e: LayoutChangeEvent) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => onChange(at(e.nativeEvent.locationX))}
      onResponderMove={(e) => onChange(at(e.nativeEvent.locationX))}
      onResponderRelease={(e) => onDone?.(at(e.nativeEvent.locationX))}
      style={styles.slider}>
      <View pointerEvents="none" style={[styles.track, { backgroundColor: c.surface3 }]}>
        <View style={{ width: `${v * 100}%`, height: "100%", backgroundColor: c.accent, borderRadius: 2 }} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${v * 100}%`, backgroundColor: c.accent }]} />
    </View>
  );
}

// --- Messages brefs (« Enregistré », erreurs) ------------------------------------------------------
type ToastMsg = { text: string; error: boolean } | null;
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children, bottom }: { children: ReactNode; bottom: number }) {
  const c = useColors();
  const [toast, setToast] = useState<ToastMsg>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), error ? 4500 : 2200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" accessibilityLiveRegion="polite"
          style={[styles.toast, { bottom, backgroundColor: toast.error ? c.danger : c.text }]}>
          <Icon name={toast.error ? "alert" : "check"} size={16} color={c.bg} />
          <Text style={{ color: c.bg, fontWeight: "600", flex: 1 }}>{toast.text}</Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, borderRadius: 12 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  switch: { width: 46, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowIco: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  check: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  avatar: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  banner: { padding: 14, borderRadius: radius.sm, borderWidth: 1 },
  slider: { height: 28, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  thumb: { position: "absolute", width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12 },
});
