# Deep Work Focus

Bloqueur de distractions pour Windows, inspiré de *Deep Work* (Cal Newport).

## Lancer
- **`Lancer Deep Work.bat`** : coupe les notifications et ferme les applications bloquées.
- **`Lancer Deep Work (admin - bloque aussi les sites).bat`** : fait la même chose et bloque en plus les sites web. Windows demande une confirmation, car il faut modifier le fichier `hosts`.

Il faut seulement Python 3.10 ou plus récent. Aucune dépendance à installer.

## Pendant une session
| Protection | Comment ça marche |
|---|---|
| Notifications | Les toasts Windows sont coupés via le registre, puis restaurés à la fin |
| Applications | Les processus de la liste noire sont fermés dès leur lancement (vérification toutes les 2 s) |
| Sites | Les domaines (+ `www.` et `m.`) sont redirigés vers `0.0.0.0` dans le fichier `hosts` |
| Mode engagement | Pour arrêter avant la fin, il faut taper une phrase d'abandon |

Si l'application plante ou est fermée de force, la session reprend au prochain lancement. Si la session est déjà finie, tout est nettoyé.

## Les notions du livre intégrées
- **Intention obligatoire** : on ne lance pas de session sans objectif précis.
- **Tableau de score (4DX)** : heures de deep work par jour, objectif hebdomadaire, série de jours, profondeur notée de 1 à 5.
- **Rituel de fin** : une checklist puis « Shutdown complete ».
- **Les 4 règles** : un résumé du livre et des 4 philosophies (monastique, bimodale, rythmique, journalistique).

## Données
Elles sont stockées dans `%APPDATA%\DeepWorkFocus\` : `config.json` (listes), `sessions.json` (historique) et `state.json` (session en cours).

## Limites
- Les applications sont fermées de force : ce qui n'est pas enregistré dans ces applications est perdu.
- Si un navigateur était déjà ouvert sur un site bloqué, il peut garder ce site en cache. Il faut fermer et rouvrir l'onglet. Si le « DNS sécurisé » est activé dans Chrome ou Edge, le blocage peut être contourné : désactive-le dans les paramètres.
- Si des notifications passent encore, active aussi « Ne pas déranger » de Windows (Win + N).
