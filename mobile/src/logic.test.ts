import { describe, expect, test } from "@jest/globals";
import {
  ABANDON_PHRASE, averageDepth, cleanDomain, cleanPhrase, completionRate, dayKey, isAudioFile, lockAllows, streak, trackTitle, weekStart, weekStats,
} from "./logic";
import { abandonPhrase, restore } from "./state";

// Mercredi 22 octobre 2026, 15 h (heure locale).
const NOW = new Date(2026, 9, 22, 15, 0).getTime();
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).getTime();
const entry = (startedAt: number, actualMin: number, completed = true, depth: number | null = null) =>
  ({ startedAt, actualMin, completed, depth });

describe("domaines (même règle que sur PC)", () => {
  test.each([
    [" https://www.YouTube.com/watch?v=1 ", "youtube.com"],
    ["lequipe.fr:443", "lequipe.fr"],
    ["web.whatsapp.com", "web.whatsapp.com"],
    ["localhost", ""],
    ["pas un domaine", ""],
    ["evil.com\n6.6.6.6 bank.com", ""],
  ])("%j → %j", (raw, expected) => expect(cleanDomain(raw)).toBe(expected));
});

describe("semaine", () => {
  test("commence le lundi à minuit", () => {
    expect(new Date(weekStart(NOW))).toEqual(new Date(2026, 9, 19, 0, 0));
  });

  test("répartit les minutes par jour et ignore les autres semaines", () => {
    const w = weekStats([entry(at(19), 90), entry(at(22, 9), 25), entry(at(22, 14), 50), entry(at(18), 120), entry(at(26), 60)], NOW);
    expect(w.perDay).toEqual([90, 0, 0, 75, 0, 0, 0]);
    expect(w.total).toBe(165);
    expect(w.todayIdx).toBe(3);
  });
});

describe("série (au moins 5 min par jour, comme sur PC)", () => {
  test("compte les jours consécutifs jusqu'à aujourd'hui", () => {
    expect(streak([entry(at(22), 30), entry(at(21), 30), entry(at(20), 30), entry(at(18), 30)], NOW)).toBe(3);
  });
  test("part d'hier si rien aujourd'hui", () => {
    expect(streak([entry(at(21), 30), entry(at(20), 30)], NOW)).toBe(2);
  });
  test("une session interrompue compte, une session de moins de 5 min non", () => {
    expect(streak([entry(at(22), 12, false)], NOW)).toBe(1);
    expect(streak([entry(at(22), 3)], NOW)).toBe(0);
  });
  test("vide", () => expect(streak([], NOW)).toBe(0));
});

describe("indicateurs", () => {
  test("profondeur moyenne des 20 dernières sessions notées", () => {
    const h = [entry(at(22), 30, true, 4), entry(at(21), 30, true, null), entry(at(20), 30, true, 2)];
    expect(averageDepth(h)).toEqual({ avg: 3, count: 2 });
    expect(averageDepth([])).toEqual({ avg: null, count: 0 });
    const many = Array.from({ length: 25 }, (_, i) => entry(at(1), 30, true, i < 20 ? 5 : 1));
    expect(averageDepth(many).avg).toBe(5);
  });
  test("pourcentage de sessions menées à terme", () => {
    expect(completionRate([entry(at(22), 30), entry(at(21), 30, false), entry(at(20), 30), entry(at(19), 30)])).toBe(75);
    expect(completionRate([])).toBe(0);
  });
  test("clé de jour locale", () => expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05"));
});

describe("mode engagement : on peut durcir, pas assouplir", () => {
  test("liste noire : ajouter oui, retirer non", () => {
    expect(lockAllows(["a"], ["a", "b"])).toBe(true);
    expect(lockAllows(["a", "b"], ["a"])).toBe(false);
  });
  test("liste blanche : retirer oui, ajouter non", () => {
    expect(lockAllows(["a", "b"], ["a"], true)).toBe(true);
    expect(lockAllows(["a"], ["a", "b"], true)).toBe(false);
  });
});

describe("musique", () => {
  test("titres lisibles comme sur PC", () => {
    expect(trackTitle("- Hyperfocus _ LOCK IN for 3 Hours _ Deep Work.m4a")).toBe("Hyperfocus · LOCK IN for 3 Hours · Deep Work");
    expect(trackTitle("Piste.mp3")).toBe("Piste");
  });
  test("formats audio reconnus", () => {
    expect(isAudioFile("a.M4A")).toBe(true);
    expect(isAudioFile("a.flac")).toBe(true);
    expect(isAudioFile("notes.txt")).toBe(false);
  });
});

describe("données enregistrées", () => {
  test("une sauvegarde d'une ancienne version est complétée sans rien perdre", () => {
    const old = JSON.stringify({
      config: { mode: "block", apps: ["com.instagram.android"], allowed: [], minutes: 50, lock: true, weeklyGoalHours: 10 },
      live: { intention: "Lire", startedAt: 1, endAt: 2, plannedMin: 50, lock: false },
      history: [{ id: "1", intention: "Écrire", startedAt: 1, endedAt: 2, plannedMin: 25, actualMin: 25, completed: true, blocked: 3 }],
      lastDone: null,
    });
    const d = restore(old);
    expect(d.config.apps).toEqual(["com.instagram.android"]);
    expect(d.config.weeklyGoalHours).toBe(10);
    expect(d.config.sites.length).toBeGreaterThan(5);
    expect(d.config.shutdownChecklist.length).toBe(4);
    expect(d.live).toMatchObject({ intention: "Lire", notif: false, apps: true, sites: false });
    expect(d.history[0]).toMatchObject({ intention: "Écrire", blocked: 3, depth: null, note: "" });
    expect(d.review).toBeNull();
  });

  test("phrase d'abandon identique au PC", () => expect(ABANDON_PHRASE).toBe("j'abandonne ma session de deep work"));
});

describe("phrase d'abandon personnalisée", () => {
  test("comparaison souple, comme sur PC", () => {
    expect(cleanPhrase("  Je  choisis la FACILITÉ ")).toBe("je choisis la facilité");
    expect(cleanPhrase("j’abandonne ma session de deep work")).toBe(ABANDON_PHRASE);
  });

  test("la session garde la phrase fixée au départ", () => {
    const d = restore(JSON.stringify({ config: { abandonPhrase: "Ma Phrase Perso à moi" } }));
    expect(abandonPhrase(d)).toBe("ma phrase perso à moi");
    const live = { intention: "x", startedAt: 1, endAt: 2, plannedMin: 5, lock: true, notif: false, apps: true, sites: false, phrase: "phrase du départ" };
    expect(abandonPhrase({ config: d.config, live })).toBe("phrase du départ");
  });

  test("une ancienne sauvegarde reçoit la phrase par défaut", () => {
    expect(abandonPhrase(restore(JSON.stringify({ config: {} })))).toBe(ABANDON_PHRASE);
  });
});
