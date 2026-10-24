// Logique sans interface, identique à la version PC (ui/app.js et opusfocus.py). Testée par logic.test.ts.

export const DURATIONS = [25, 50, 90, 120, 180];
export const DEPTH_LABELS = ["Dispersé", "Distrait", "Correct", "Concentré", "Immersion"];
/** Phrase d'abandon par défaut, modifiable dans les réglages (entre PHRASE_MIN et PHRASE_MAX caractères). */
export const ABANDON_PHRASE = "j'abandonne ma session de deep work";
export const PHRASE_MIN = 10;
export const PHRASE_MAX = 150;

/** Même règle que sur PC : minuscules, espaces superflus retirés, apostrophe typographique unifiée. */
export const cleanPhrase = (s: string) => s.replace(/’/g, "'").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
export const QUOTES = [
  "Une heure de travail profond vaut mieux qu'une journée de travail dispersé.",
  "Ce qu'on accomplit, c'est le temps passé multiplié par l'intensité de la concentration.",
  "Ne fais pas de pauses dans ta concentration : fais des pauses dans la distraction.",
  "L'ennui n'est pas l'ennemi : c'est l'entraînement de ta concentration.",
  "Quand tu travailles, travaille dur. Quand tu as fini, arrête.",
  "Le travail profond est à la fois rare et précieux.",
];

export const DEFAULT_SITES = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "reddit.com",
  "netflix.com", "twitch.tv", "linkedin.com", "snapchat.com", "pinterest.com",
];
export const SITE_CATALOG: Record<string, string[]> = {
  "Réseaux sociaux": ["facebook.com", "instagram.com", "x.com", "twitter.com", "tiktok.com", "snapchat.com", "linkedin.com", "pinterest.com", "reddit.com", "threads.net", "bsky.app"],
  "Vidéo et streaming": ["youtube.com", "netflix.com", "twitch.tv", "primevideo.com", "disneyplus.com", "crunchyroll.com", "dailymotion.com"],
  "Messagerie web": ["web.whatsapp.com", "messenger.com", "discord.com", "web.telegram.org"],
  "Actualités": ["lemonde.fr", "lefigaro.fr", "bfmtv.com", "francetvinfo.fr", "20minutes.fr", "liberation.fr", "news.google.com"],
  "Shopping": ["amazon.fr", "amazon.com", "leboncoin.fr", "vinted.fr", "aliexpress.com", "temu.com", "shein.com"],
};

export const DEFAULT_CHECKLIST = [
  "J'ai vérifié mes e-mails et messages une dernière fois",
  "J'ai noté chaque tâche en suspens dans ma liste",
  "J'ai relu mon agenda des prochains jours",
  "J'ai planifié les blocs de deep work de demain",
];

export const CATEGORIES: Record<string, string> = {
  social: "Réseaux et messagerie", games: "Jeux", media: "Vidéo et musique", browsers: "Navigateurs", other: "Autres",
};
/** Catégories proposées en premier (comme sur PC). */
export const SUGGESTED_CATEGORIES = new Set(["social", "games", "media"]);
/** Applications distrayantes connues, même si leur éditeur ne déclare pas de catégorie. */
export const DISTRACTING = new Set([
  "com.instagram.android", "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.facebook.katana",
  "com.facebook.orca", "com.snapchat.android", "com.twitter.android", "com.google.android.youtube",
  "com.reddit.frontpage", "com.netflix.mediaclient", "com.whatsapp", "org.telegram.messenger", "com.discord",
  "tv.twitch.android.app", "com.pinterest", "com.linkedin.android", "com.amazon.avod.thirdpartyclient",
  "com.disney.disneyplus", "com.spotify.music", "com.supercell.clashroyale", "com.supercell.clashofclans",
  "com.king.candycrushsaga", "com.roblox.client", "com.mojang.minecraftpe", "com.tinder", "com.bumble.app",
  "com.vinted", "com.google.android.apps.youtube.music", "com.zhiliaoapp.musically.go", "com.instagram.barcelona",
  "com.twitter.android.lite", "fr.leboncoin", "com.lemonde.androidapp", "com.ea.gp.fifamobile",
]);

export type HistoryEntry = { startedAt: number; actualMin: number; completed: boolean; depth: number | null };

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

/** « https://www.Site.com/page » → « site.com » ; "" si ce n'est pas un domaine (même règle que sur PC). */
export function cleanDomain(raw: string): string {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0].replace(/^www\./, "");
  return DOMAIN_RE.test(d) ? d : "";
}

/** Clé « AAAA-MM-JJ » du jour local. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Lundi 00:00 de la semaine de `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Minutes par jour de la semaine en cours (lundi → dimanche), total et indice d'aujourd'hui. */
export function weekStats(history: HistoryEntry[], now: number) {
  const monday = new Date(weekStart(now));
  const perDay = Array(7).fill(0) as number[];
  for (const s of history) {
    // Indice par date de calendrier (insensible aux changements d'heure).
    const d = new Date(s.startedAt);
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - monday.getTime()) / 86400000);
    if (idx >= 0 && idx < 7) perDay[idx] += s.actualMin;
  }
  return { perDay, total: perDay.reduce((a, b) => a + b, 0), todayIdx: (new Date(now).getDay() + 6) % 7 };
}

/** Jours consécutifs (jusqu'à aujourd'hui, ou hier si rien aujourd'hui) avec au moins 5 min de deep work. */
export function streak(history: HistoryEntry[], now: number): number {
  const days = new Set(history.filter((s) => s.actualMin >= 5).map((s) => dayKey(new Date(s.startedAt))));
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Profondeur moyenne des 20 dernières sessions notées (history du plus récent au plus ancien). */
export function averageDepth(history: HistoryEntry[]): { avg: number | null; count: number } {
  const rated = history.filter((s) => s.depth).slice(0, 20);
  return { avg: rated.length ? rated.reduce((a, s) => a + (s.depth ?? 0), 0) / rated.length : null, count: rated.length };
}

/** Pourcentage de sessions menées à terme. */
export const completionRate = (history: HistoryEntry[]) =>
  history.length ? Math.round((history.filter((s) => s.completed).length / history.length) * 100) : 0;

/**
 * Mode engagement : on peut seulement durcir la protection. Renvoie vrai si le passage de `before`
 * à `after` est permis. `allowList` : la liste est une liste blanche (retirer durcit, ajouter assouplit).
 */
export function lockAllows(before: string[], after: string[], allowList = false): boolean {
  const a = new Set(after), b = new Set(before);
  return allowList ? after.every((x) => b.has(x)) : before.every((x) => a.has(x));
}

/** Titre lisible d'un fichier audio (« Piste _ Focus.m4a » → « Piste · Focus »), comme sur PC. */
export function trackTitle(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return stem.replace(/\s+_\s+/g, " · ").replace(/^[\s\-_]+|[\s\-_]+$/g, "") || stem;
}

export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".mp4", ".aac", ".ogg", ".opus", ".wav", ".flac", ".webm"];
export const isAudioFile = (name: string) => AUDIO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
