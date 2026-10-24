import { useColorScheme } from "react-native";

// Mêmes couleurs que la version PC (ui/style.css).
const dark = {
  bg: "#0e1014",
  surface: "#15181e",
  surface2: "#1c2028",
  surface3: "#252a34",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.14)",
  text: "#ecebe7",
  muted: "#a0a5b0",
  faint: "#6f7480",
  accent: "#e2b66b",
  onAccent: "#1b1408",
  accentSoft: "rgba(226,182,107,0.12)",
  accentLine: "rgba(226,182,107,0.45)",
  success: "#7dc49a",
  successSoft: "rgba(125,196,154,0.12)",
  danger: "#ec8a80",
  dangerSoft: "rgba(236,138,128,0.12)",
};

const light: typeof dark = {
  bg: "#f5f4f0",
  surface: "#ffffff",
  surface2: "#f0eee8",
  surface3: "#e6e3db",
  border: "rgba(20,20,20,0.08)",
  borderStrong: "rgba(20,20,20,0.16)",
  text: "#1d1f24",
  muted: "#5a5f6a",
  faint: "#80848e",
  accent: "#8f6118",
  onAccent: "#ffffff",
  accentSoft: "rgba(143,97,24,0.09)",
  accentLine: "rgba(143,97,24,0.4)",
  success: "#2b7149",
  successSoft: "rgba(43,113,73,0.1)",
  danger: "#b0413a",
  dangerSoft: "rgba(176,65,58,0.09)",
};

export type Colors = typeof dark;

export const useColors = (): Colors => (useColorScheme() === "light" ? light : dark);

export const radius = { sm: 10, md: 14, lg: 18 };
