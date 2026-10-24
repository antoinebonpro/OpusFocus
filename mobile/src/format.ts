// 25 → « 25 min », 90 → « 1 h 30 », 120 → « 2 h » (comme sur PC).
export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${Math.round(min)} min`;
};

export const fmtRemaining = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const fmtHours = (min: number) => {
  const h = min / 60;
  return h >= 10 ? h.toFixed(0) : h.toFixed(1).replace(".", ",");
};

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Lundi 00:00 de la semaine de `ts`. */
export const weekStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

export const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
