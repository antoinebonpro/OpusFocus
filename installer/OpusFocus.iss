; Installateur Windows d'OpusFocus (Inno Setup 6). Construit par build.ps1 après dist\OpusFocus.exe.
; Installation par utilisateur, sans droits administrateur : %LOCALAPPDATA%\Programs\OpusFocus.

#define AppName "OpusFocus"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{7C3E2B9A-4F1D-4C8E-9A57-0F5D2E6B1A43}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Antoine Bon
DefaultDirName={localappdata}\Programs\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=OpusFocus-Setup
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\OpusFocus.exe
UninstallDisplayName={#AppName}
; Ferme l'application ouverte avant de la remplacer ou de la désinstaller.
AppMutex=Local\OpusFocus
CloseApplications=yes
WizardStyle=modern
Compression=lzma2
SolidCompression=yes

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "..\dist\OpusFocus.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{app}\OpusFocus.exe"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\OpusFocus.exe"; Tasks: desktopicon

[Registry]
; Ouverture au démarrage (réglable ensuite dans OpusFocus > Réglages), retirée à la désinstallation.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\OpusFocus.exe"" --startup"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\OpusFocus.exe"; Description: "Lancer OpusFocus"; Flags: nowait postinstall skipifsilent
