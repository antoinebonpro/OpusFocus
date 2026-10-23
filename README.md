# OpusFocus

Bloqueur de distractions pour Windows, inspiré de *Deep Work* (Cal Newport).

## Lancer
- **`OpusFocus.exe`** (construit avec `build.ps1`, dans `dist\`) : l'application complète en un seul fichier, sans Python à installer. Place un dossier `Music` à côté pour la musique focus.
- **`Lancer Deep Work.bat`** : ouvre l'application. Elle coupe les notifications et ferme les applications cochées.
- **`Lancer Deep Work (admin - bloque aussi les sites).bat`** : même chose, avec en plus le blocage des sites web (Windows demande une confirmation). Tu peux aussi activer ce mode plus tard, depuis l'application, avec le bouton « Activer ».

Il faut Python 3.10 ou plus récent, et Edge, Chrome ou Brave pour afficher la fenêtre. Aucune dépendance à installer.

## Utilisation
1. **Session** : écris ton intention, choisis une durée, vérifie les protections, puis appuie sur *Commencer*.
2. **Applications** : toutes les applications installées sont listées avec leur icône. Coche celles qui te distraient. Les distractions détectées (réseaux, jeux, vidéo) sont proposées en premier, et un bouton permet de toutes les cocher d'un coup.
3. **Sites web** : coche les sites dans le catalogue ou ajoute les tiens.
4. **Progrès** : heures par jour, objectif de la semaine, série de jours, profondeur moyenne et historique.
5. **Fin de journée** : la checklist du rituel de fin, puis « Shutdown complete ».

Les cases cochées sont enregistrées automatiquement. Tu peux fermer la fenêtre pendant une session : la protection continue, et la fenêtre se rouvre à la fin pour le bilan.

## Fonctionnement
| Protection | Comment ça marche |
|---|---|
| Notifications | Les toasts Windows sont coupés via le registre, puis restaurés à la fin |
| Applications | Les processus cochés sont fermés dès qu'ils apparaissent (vérification toutes les 1,5 s) |
| Sites | Les domaines (+ `www.` et `m.`) sont redirigés vers `0.0.0.0` dans le fichier `hosts` |
| Mode engagement | Pour arrêter avant la fin, il faut taper une phrase d'abandon. On peut ajouter des blocages, pas en retirer |

Architecture : `deepwork.py` est le moteur. Il sert l'interface (`ui/`) sur `127.0.0.1`, protégée par un jeton, et l'affiche dans une fenêtre de navigateur en mode application. `scan_apps.ps1` liste les applications du menu Démarrer et du Microsoft Store.

Si l'application plante, la session reprend au prochain lancement ; si elle est déjà terminée, tout est restauré. Un navigateur peut être bloqué sans risque : les processus qui affichent OpusFocus sont reconnus et épargnés.

## Données
Elles sont stockées dans `%APPDATA%\DeepWorkFocus\` (nom d'origine, conservé au renommage) : `config.json` (listes et réglages), `sessions.json` (historique), `apps.json` (cache des applications) et `state.json` (session en cours).

## Sécurité
- L'interface n'écoute que sur `127.0.0.1`. Chaque appel à l'API exige un jeton aléatoire, et l'en-tête `Host` est vérifié contre le DNS rebinding.
- Une politique CSP stricte n'autorise que les scripts de l'application et interdit l'affichage dans une iframe.
- Tout ce qui est saisi est validé avant usage : domaines (aucune ligne ne peut être injectée dans le fichier `hosts`), noms d'applications, durées, notes. Les processus système ne peuvent jamais être bloqués.

## Tests
```
python -m unittest discover -s tests -v
```
58 tests couvrent la logique, la sécurité de l'API (jeton, rebinding, CSP, traversée de chemin, corps malformés), le fichier `hosts`, la reprise après plantage et l'interface (échappement HTML). Ils travaillent dans un dossier temporaire et ne touchent ni tes données ni le vrai fichier `hosts`. Seuls deux tests touchent Windows, de façon contrôlée : l'un ferme un processus factice, l'autre lit la clé des notifications puis la restaure.

## Limites
- Les applications sont fermées de force : ce qui n'y est pas enregistré est perdu.
- Si un site reste accessible, ferme et rouvre son onglet. Si le « DNS sécurisé » est activé dans le navigateur, le blocage peut être contourné : désactive-le.
- Si des notifications passent encore, active aussi « Ne pas déranger » (Win + N).
