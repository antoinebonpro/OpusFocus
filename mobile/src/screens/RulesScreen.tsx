import { Text, View } from "react-native";
import { useColors } from "../theme";
import { Card, PageHead } from "../ui";

type Rule = { title: string; lead: string; points: [string, string][] };

// Même contenu que la page « Principes » sur PC.
const RULES: Rule[] = [
  {
    title: "Travailler en profondeur",
    lead: "Choisis une philosophie et ritualise : un lieu, une durée, des règles fixes.",
    points: [
      ["Rythmique", "un bloc chaque jour à la même heure. La plus simple à tenir."],
      ["Bimodale", "des jours ou des semaines entières consacrés au deep work."],
      ["Journalistique", "tu plonges dès qu'un créneau se libère (demande de l'entraînement)."],
      ["Monastique", "tu élimines presque toutes les distractions, en permanence."],
    ],
  },
  {
    title: "Accepter l'ennui",
    lead: "Ne fais pas de pauses dans ta concentration : fais des pauses dans la distraction.",
    points: [
      ["", "Programme à l'avance tes moments d'Internet, et respecte-les."],
      ["", "Pratique la méditation productive : réfléchis à un problème pendant une marche."],
      ["", "Si tu ne supportes pas cinq minutes d'ennui, tu ne tiendras pas une heure de réflexion."],
    ],
  },
  {
    title: "Quitter les réseaux sociaux",
    lead: "Garde un outil seulement si ses bénéfices pour ce qui compte vraiment dépassent clairement ses coûts.",
    points: [
      ["", "Fais le test des 30 jours : arrête. Ça t'a manqué ? Quelqu'un l'a remarqué ?"],
      ["", "Prévois tes loisirs à l'avance plutôt que de te laisser happer par un fil."],
    ],
  },
  {
    title: "Assécher les eaux peu profondes",
    lead: "Programme chaque minute de ta journée en blocs et fixe un budget au travail superficiel.",
    points: [
      ["", "Demande-toi combien de mois un jeune diplômé mettrait à apprendre à faire cette tâche : plus c'est court, plus elle est superficielle."],
      ["", "Termine chaque journée par un rituel de fin."],
    ],
  },
];

export function RulesScreen() {
  const c = useColors();
  return (
    <View style={{ gap: 14 }}>
      <PageHead title="Les 4 règles du Deep Work" text="L'essentiel du livre de Cal Newport, à relire quand la motivation flanche." />
      {RULES.map((r, i) => (
        <Card key={r.title} style={{ gap: 8 }}>
          <Text style={{ color: c.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>Règle {i + 1}</Text>
          <Text style={{ color: c.text, fontSize: 19, fontWeight: "700" }}>{r.title}</Text>
          <Text style={{ color: c.muted, lineHeight: 20 }}>{r.lead}</Text>
          {r.points.map(([bold, text]) => (
            <View key={text} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: c.accent }}>•</Text>
              <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>
                {bold ? <Text style={{ fontWeight: "700" }}>{bold} : </Text> : null}{text}
              </Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}
