# OpusFocus

Bloqueur de distractions inspiré de *Deep Work* (Cal Newport), pour Windows et Android.

## Installer
- **PC (Windows 10/11)** : lance `dist\OpusFocus-Setup.exe`. L'installation se fait sans droits administrateur, dans `%LOCALAPPDATA%\Programs\OpusFocus`. Elle ajoute un raccourci au menu Démarrer (et au bureau si tu le coches), une entrée dans *Paramètres > Applications* pour la désinstaller, et l'ouverture automatique à l'ouverture de session Windows. Ce dernier réglage se change dans OpusFocus > *Réglages*.
- **Android (7.0 ou plus récent)** : copie `dist\OpusFocus.apk` sur le téléphone, ouvre-le et autorise l'installation. Au premier lancement, l'application t'indique les trois autorisations à donner une seule fois : accessibilité (applications), « Ne pas déranger » (notifications), VPN local (sites).

## Utilisation (identique sur PC et Android)
1. **Session** : écris ton intention, choisis une durée, vérifie les protections (notifications, applications, sites, mode engagement), puis *Commencer*.
2. **Applications** : les applications installées, avec leur icône et leur catégorie (réseaux, jeux, vidéo, navigateurs). Les distractions détectées sont proposées en premier, avec un bouton pour toutes les cocher. Sur Android, un mode « Seulement mes apps » bloque tout sauf les applications cochées (le téléphone, le clavier et les réglages restent toujours accessibles).
3. **Sites web** : coche les sites dans le catalogue ou ajoute les tiens.
4. **Progrès** : heures de la semaine et objectif, série de jours, profondeur moyenne, taux de sessions menées à terme, graphique par jour et historique.
5. **Fin de journée** : la checklist du rituel de fin, puis « Shutdown complete ».
6. **Principes** : les 4 règles du livre.
7. **Musique focus** : tes pistes audio, avec reprise de la lecture là où tu t'étais arrêté. La musique peut démarrer et s'arrêter avec la session. Sur PC, dépose tes fichiers dans `Musique\OpusFocus`. Sur Android, ajoute-les depuis l'application : elle continue à jouer écran éteint.
8. **Réglages** : ouverture au démarrage, musique avec la session, autorisations.

À la fin de la session, OpusFocus te prévient et te propose un bilan : profondeur de 1 à 5, plus une note. Tu peux quitter l'application pendant une session : la protection continue jusqu'à l'heure prévue.

## Fonctionnement
| Protection | PC | Android |
|---|---|---|
| Notifications | Toasts Windows coupés via le registre, puis restaurés | Mode « Ne pas déranger » (prioritaires seulement), puis retour au réglage d'avant |
| Applications | Processus cochés fermés dès qu'ils apparaissent (toutes les 1,5 s) | Service d'accessibilité : l'application bloquée est remplacée par l'écran « Reste concentré » |
| Sites | Domaines (+ `www.` et `m.`) redirigés vers `0.0.0.0` dans le fichier `hosts` (droits admin) | VPN local qui ne transporte que le DNS : domaines et sous-domaines bloqués, le reste est transmis normalement |
| Fin à l'heure | Moteur en arrière-plan, la fenêtre se rouvre pour le bilan | Service au premier plan (compte à rebours en notification), notification de fin, réveil de secours |
| Mode engagement | Phrase d'abandon à taper, on peut ajouter des blocages mais pas en retirer | Identique |
| Démarrage | Clé `Run` de Windows (`--startup`) | Ouverture au démarrage du téléphone ; une session en cours reprend après un redémarrage |

## Projet
- `opusfocus.py` : moteur PC. Il sert l'interface (`ui/`) sur `127.0.0.1`, protégée par un jeton, et l'affiche dans une fenêtre de navigateur en mode application. `scan_apps.ps1` liste les applications du menu Démarrer et du Microsoft Store.
- `installer\OpusFocus.iss` : installateur (Inno Setup).
- `mobile/` : application Android (Expo / React Native). `mobile/modules/focus-blocker` contient le code natif Kotlin : blocage, VPN DNS, session, démarrage.

### Construire
```
powershell -ExecutionPolicy Bypass -File build.ps1                         # dist\OpusFocus.exe + dist\OpusFocus-Setup.exe
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1 -Test   # dist\OpusFocus.apk (+ tests natifs)
```
L'installateur demande Inno Setup 6 (`winget install JRSoftware.InnoSetup --source winget --scope user`). L'APK demande Android Studio (JDK et SDK).

### Tester
```
python -m unittest discover -s tests -v      # PC : 71 tests
cd mobile && npm test && npm run typecheck && npm run lint
```
Les tests PC travaillent dans un dossier temporaire et ne touchent ni tes données, ni le vrai fichier `hosts`, ni la vraie clé de démarrage.

## Données
- **PC** : `%APPDATA%\OpusFocus\` (`config.json`, `sessions.json`, `apps.json`, `state.json`). Les données des versions nommées « Deep Work Focus » (`%APPDATA%\DeepWorkFocus`) sont reprises automatiquement au premier lancement ; l'ancien dossier est gardé comme sauvegarde.
- **Android** : stockage interne de l'application. Les données des anciennes versions sont reprises de la même façon.

## Sécurité
- PC : l'interface n'écoute que sur `127.0.0.1`. Chaque appel à l'API exige un jeton aléatoire, et l'en-tête `Host` est vérifié contre le DNS rebinding. La CSP est stricte. Les domaines, noms d'applications et durées sont validés, si bien qu'aucune ligne ne peut être injectée dans le fichier `hosts`.
- Android : le service d'accessibilité ne lit que le nom de l'application au premier plan, jamais le contenu de l'écran. Le VPN ne voit que les noms de domaine demandés, et rien n'est envoyé ailleurs qu'au DNS habituel.

## Limites
- PC : les applications sont fermées de force, donc ce qui n'y est pas enregistré est perdu. Si le « DNS sécurisé » est activé dans le navigateur, le blocage des sites peut être contourné.
- Android : si le « DNS privé » est réglé sur un fournisseur précis, choisis « Automatique ». Un seul VPN peut être actif à la fois sur le téléphone. Sur Android 13 et plus, une application installée hors du Play Store doit d'abord « Autoriser les paramètres restreints » (fiche de l'app, menu ⋮) pour activer l'accessibilité. L'APK est signé avec une clé de développement : il s'installe directement, mais une publication sur le Play Store demandera une clé de signature dédiée.
