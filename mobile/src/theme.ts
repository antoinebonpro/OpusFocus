import { useColorScheme } from "react-native";

// Mêmes couleurs que la version PC (ui/style.css).
const dark = {
  bg: "#0d1814",
  surface: "#15241d",
  surface2: "#1c2f26",
  surface3: "#253b31",
  border: "rgba(245,248,240,0.09)",
  borderStrong: "rgba(245,248,240,0.18)",
  text: "#f8f5ec",
  muted: "#b3bdb2",
  faint: "#92a097",
  accent: "#22c870",
  onAccent: "#0d1814",
  accentSoft: "rgba(34,200,112,0.14)",
  accentLine: "rgba(34,200,112,0.45)",
  success: "#4ee79b",
  successSoft: "rgba(78,231,155,0.12)",
  danger: "#ec8a80",
  dangerSoft: "rgba(236,138,128,0.12)",
};

const light: typeof dark = {
  bg: "#f8f5ec",
  surface: "#fffdf7",
  surface2: "#f1ebd9",
  surface3: "#e7dfc8",
  border: "rgba(13,24,20,0.10)",
  borderStrong: "rgba(13,24,20,0.20)",
  text: "#0d1814",
  muted: "#2c4a3d",
  faint: "#5d7268",
  accent: "#15904a",
  onAccent: "#ffffff",
  accentSoft: "rgba(21,144,74,0.10)",
  accentLine: "rgba(21,144,74,0.4)",
  success: "#15904a",
  successSoft: "rgba(21,144,74,0.1)",
  danger: "#b0413a",
  dangerSoft: "rgba(176,65,58,0.09)",
};

export type Colors = typeof dark;

export const useColors = (): Colors => (useColorScheme() === "light" ? light : dark);

export const radius = { sm: 10, md: 14, lg: 18 };
