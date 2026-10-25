<div align="center">

<img src="docs/img/icon.png" width="96" alt="">

# OpusFocus

**Une seule chose à la fois.**

Bloqueur de distractions inspiré du livre *Deep Work* de Cal Newport, pour Windows et Android.<br>
Gratuit, sans compte, aucune donnée envoyée.

[**Télécharger pour Windows**](https://github.com/antoinebonpro/OpusFocus/releases/latest/download/OpusFocus-Setup.exe) ·
[Android (APK)](https://github.com/antoinebonpro/OpusFocus/releases/latest/download/OpusFocus.apk) ·
[Site](https://antoinebonpro.github.io/OpusFocus/)

<img src="docs/img/pc-session.webp" width="820" alt="OpusFocus sur Windows : une session de travail profond en cours">

</div>

---

## Le principe

Tu écris ce sur quoi tu vas travailler, tu choisis une durée, et OpusFocus fait le vide autour de toi jusqu'à la fin :

- 🔕 **les notifications** se taisent ;
- 🚫 **les applications** qui te distraient se ferment dès qu'elles s'ouvrent ;
- 🌐 **les sites** cochés ne s'ouvrent plus, dans aucun navigateur ;
- 🔒 **le mode engagement** t'empêche d'abandonner sur un coup de tête : pour arrêter, il faut taper une phrase que tu as choisie.

À la fin, OpusFocus te prévient et te propose un bilan rapide (profondeur de 1 à 5, plus une note). Tes heures, tes séries et ta progression s'affichent dans *Progrès*.

## Installer

### Windows 10 et 11

1. Télécharge et lance **`OpusFocus-Setup.exe`**.
2. Windows demande une fois les droits administrateur : c'est pour installer le **service de blocage des sites** (voir plus bas). Ensuite, plus aucune demande, jamais.
3. OpusFocus s'ouvre. Pour l'avoir toujours sous la main : clic droit sur son icône dans la barre des tâches, puis **Épingler à la barre des tâches**.

> L'installateur n'est pas signé : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ». Clique sur *Informations complémentaires*, puis *Exécuter quand même*.

### Android 7.0 et plus

Copie `OpusFocus.apk` sur le téléphone, ouvre-le et autorise l'installation. Au premier lancement, l'application t'indique les trois autorisations à donner une seule fois : accessibilité (applications), « Ne pas déranger » (notifications), VPN local (sites).

## Au quotidien sur Windows

| | |
|---|---|
| **Toujours là** | Une icône OpusFocus reste près de l'horloge. Fermer la fenêtre ne quitte pas l'app : un clic sur l'icône la rouvre. Clic droit, *Quitter*, pour l'arrêter (impossible pendant une session). |
| **Épinglée** | L'icône épinglée dans la barre des tâches ouvre OpusFocus, ou ramène la fenêtre si elle est déjà ouverte. |
| **Au démarrage** | OpusFocus se lance discrètement à l'ouverture de session, près de l'horloge. Une session en cours reprend là où elle en était. Réglable dans *Réglages*. |
| **Sans droits admin** | Le blocage des sites passe par le service installé : tu n'as plus rien à accepter. |

## Les pages

1. **Session** : intention, durée, protections, puis *Commencer*. Pendant la session, un minuteur et le nombre de distractions bloquées.
2. **Applications** : les applications installées, avec leur icône et leur catégorie (réseaux, jeux, vidéo, navigateurs). Les distractions détectées sont proposées en premier. Sur Android, le mode « Seulement mes apps » bloque tout sauf les applications cochées (téléphone, clavier et réglages restent accessibles).
3. **Sites web** : un catalogue à cocher, plus tes propres sites.
4. **Progrès** : heures de la semaine et objectif, série de jours, profondeur moyenne, taux de sessions menées à terme, graphique par jour et historique.
5. **Fin de journée** : la checklist du rituel de fin de journée, jusqu'au « Shutdown complete ».
6. **Principes** : les quatre règles du livre.
7. **Musique focus** : tes pistes audio, qui reprennent là où tu t'étais arrêté et peuvent démarrer et s'arrêter avec la session. Sur PC, dépose tes fichiers dans `Musique\OpusFocus`. Sur Android, ajoute-les depuis l'application.
8. **Réglages** : démarrage, musique, phrase d'abandon, objectif de la semaine.

<div align="center">
<img src="docs/img/pc-progres.webp" width="49%" alt="Page Progrès sur Windows">
<img src="docs/img/mobile-session.webp" width="22%" alt="Session sur Android">
<img src="docs/img/mobile-bilan.webp" width="22%" alt="Bilan sur Android">
</div>

## Comment ça marche

| Protection | Windows | Android |
|---|---|---|
| Notifications | Notifications Windows coupées via le registre, puis restaurées | Mode « Ne pas déranger » (prioritaires seulement), puis retour au réglage d'avant |
| Applications | Processus cochés fermés dès qu'ils apparaissent (toutes les 1,5 s) | Service d'accessibilité : l'application bloquée est remplacée par l'écran « Reste concentré » |
| Sites | Domaines (avec `www.` et `m.`) redirigés vers `0.0.0.0` dans le fichier `hosts`, par le service de blocage | VPN local qui ne transporte que le DNS : domaines et sous-domaines bloqués, le reste passe normalement |
| Fin à l'heure | Le moteur reste actif près de l'horloge et rouvre la fenêtre pour le bilan | Service au premier plan (compte à rebours en notification), notification de fin, réveil de secours |
| Mode engagement | Phrase d'abandon à taper ; on peut ajouter des blocages, pas en retirer | Identique |
| Démarrage | Clé `Run` de Windows (`--startup`) | Ouverture au démarrage du téléphone ; une session en cours reprend après un redémarrage |

### Le service de blocage des sites (Windows)

Windows protège le fichier `hosts`, qui sert à bloquer les sites : il faut les droits administrateur pour y écrire. Plutôt que de lancer toute l'application en administrateur à chaque fois, l'installateur met en place un tout petit service :

```
OpusFocus (sans droits)                          Service (SYSTEM, tâche planifiée au démarrage)
  │  écrit la liste des sites + l'heure de fin   │
  └──► C:\ProgramData\OpusFocus\sites.json ─────►│  relit chaque seconde
                                                 └──► écrit le bloc OpusFocus dans hosts
```

- Le service ne fait **qu'une chose** : aligner le bloc OpusFocus du fichier `hosts` sur la demande. Il revalide chaque domaine, refuse les fichiers trop gros ou les liens, et n'écrit que des lignes `0.0.0.0 domaine`. Même un programme malveillant qui modifierait la demande ne pourrait que bloquer ou débloquer des sites, jamais rediriger vers une autre adresse.
- Chaque demande porte son **heure de fin** : si l'application plante, les sites se débloquent quand même à l'heure prévue.
- Il est installé dans `Program Files`, où seul un administrateur peut modifier l'exécutable.
- La désinstallation retire le service, le dossier `ProgramData\OpusFocus` et tout bloc resté dans `hosts`.

Sans le service (par exemple en lançant `opusfocus.py` directement), le bouton *Activer le mode administrateur* relance OpusFocus avec les droits, le temps d'une session.

### Épinglage dans la barre des tâches

La fenêtre est une fenêtre Edge (ou Chrome, Brave) en mode application. OpusFocus lui donne sa propre identité dans la barre des tâches (`AppUserModelID` et commande de relance) : une fois épinglée, l'icône relance `OpusFocus.exe` et non le navigateur.

## Le projet

```
opusfocus.py          moteur Windows : blocages, serveur local, icône, service de blocage des sites
ui/                   interface (HTML, CSS, JS sans dépendance), servie sur 127.0.0.1
scan_apps.ps1         liste des applications du menu Démarrer et du Microsoft Store
installer/            installateur Inno Setup
build.ps1             construit l'exe et l'installateur
tests/                tests du moteur Windows
mobile/               application Android (Expo / React Native)
  modules/focus-blocker   code natif Kotlin : blocage, VPN DNS, session, démarrage
docs/                 site de présentation (GitHub Pages)
```

### Construire

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1                            # dist\OpusFocus.exe + dist\OpusFocus-Setup.exe
powershell -ExecutionPolicy Bypass -File mobile\scripts\build-apk.ps1 -Test   # dist\OpusFocus.apk (+ tests natifs)
```

L'installateur demande Inno Setup 6 (`winget install JRSoftware.InnoSetup --source winget --scope user`). L'APK demande Android Studio (JDK et SDK).

### Tester

```powershell
python -m unittest discover -s tests -v          # Windows : 84 tests
cd mobile; npm test; npm run typecheck; npm run lint
```

Les tests Windows travaillent dans un dossier temporaire : ils ne touchent ni tes données, ni le vrai fichier `hosts`, ni la vraie clé de démarrage.

## Tes données

- **Windows** : `%APPDATA%\OpusFocus\` (`config.json`, `sessions.json`, `apps.json`, `state.json`). Les données des versions « Deep Work Focus » sont reprises automatiquement au premier lancement.
- **Android** : stockage interne de l'application.

Rien ne quitte ton appareil : pas de compte, pas de statistiques envoyées, pas de publicité.

## Sécurité

- **Windows** : l'interface n'écoute que sur `127.0.0.1`. Chaque appel à l'API exige un jeton aléatoire, l'en-tête `Host` est vérifié (protection contre le DNS rebinding) et la CSP est stricte. Les domaines, noms d'applications et durées sont validés : aucune ligne ne peut être injectée dans `hosts`.
- **Android** : le service d'accessibilité ne lit que le nom de l'application au premier plan, jamais le contenu de l'écran. Le VPN ne voit que les noms de domaine demandés et ne les envoie qu'au DNS habituel.

## Limites connues

- **Windows** : les applications bloquées sont fermées de force, donc ce qui n'y est pas enregistré est perdu. Si le « DNS sécurisé » est activé dans le navigateur, il peut contourner le blocage des sites.
- **Android** : si le « DNS privé » est réglé sur un fournisseur précis, choisis « Automatique ». Un seul VPN peut être actif à la fois. Sur Android 13 et plus, une application installée hors du Play Store doit d'abord « Autoriser les paramètres restreints » (fiche de l'app, menu ⋮) pour activer l'accessibilité. L'APK est signé avec une clé de développement.
