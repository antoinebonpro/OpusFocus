; Installateur Windows d'OpusFocus (Inno Setup 6). Construit par build.ps1 après dist\OpusFocus.exe.
; Installation pour tous les utilisateurs dans Program Files : une seule demande de droits administrateur,
; pour installer le service qui bloque les sites. L'application elle-même tourne ensuite sans droits.

#define AppName "OpusFocus"
#define HelperTask "OpusFocus\Blocage des sites"
#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif

[Setup]
AppId={{7C3E2B9A-4F1D-4C8E-9A57-0F5D2E6B1A43}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Antoine Bon
; Program Files : seul un administrateur peut y modifier l'exe que le service lance en SYSTEM.
DefaultDirName={autopf}\{#AppName}
UsePreviousAppDir=no
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
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

[Dirs]
; Dossier où l'application dépose la liste des sites pour le service.
Name: "{commonappdata}\{#AppName}"; Permissions: users-modify

[Files]
Source: "..\dist\OpusFocus.exe"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Ancienne installation par utilisateur (sans service) : remplacée par celle-ci.
Type: filesandordirs; Name: "{localappdata}\Programs\{#AppName}"
Type: files; Name: "{userprograms}\{#AppName}.lnk"
Type: files; Name: "{userdesktop}\{#AppName}.lnk"

[Icons]
; Même identifiant que la fenêtre : épinglée, l'icône relance OpusFocus.
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\OpusFocus.exe"; AppUserModelID: "{#AppName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\OpusFocus.exe"; AppUserModelID: "{#AppName}"; Tasks: desktopicon

[Registry]
; Ouverture au démarrage (réglable ensuite dans OpusFocus > Réglages), retirée à la désinstallation.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#AppName}"; \
  ValueData: """{app}\OpusFocus.exe"" --startup"; Flags: uninsdeletevalue
; Entrée « Applications installées » de l'ancienne installation par utilisateur.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{7C3E2B9A-4F1D-4C8E-9A57-0F5D2E6B1A43}_is1"; \
  ValueType: none; Flags: deletekey

[Run]
; Service de blocage des sites : tâche planifiée SYSTEM, lancée à chaque démarrage, sans limite de durée.
Filename: "powershell.exe"; StatusMsg: "Installation du service de blocage des sites..."; Flags: runhidden waituntilterminated; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$a = New-ScheduledTaskAction -Execute '{app}\OpusFocus.exe' -Argument '--sites-helper'; $t = New-ScheduledTaskTrigger -AtStartup; $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName '{#HelperTask}' -Action $a -Trigger $t -Settings $s -User 'SYSTEM' -RunLevel Highest -Force | Out-Null; Start-ScheduledTask -TaskName '{#HelperTask}'"""
Filename: "{app}\OpusFocus.exe"; Description: "Lancer OpusFocus"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/End /TN ""{#HelperTask}"""; Flags: runhidden; RunOnceId: "StopHelper"
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""{#HelperTask}"" /F"; Flags: runhidden; RunOnceId: "DeleteHelper"
; Retire un éventuel bloc de sites resté dans hosts.
Filename: "{app}\OpusFocus.exe"; Parameters: "--sites-cleanup"; Flags: runhidden waituntilterminated; RunOnceId: "CleanHosts"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\{#AppName}"

[Code]
// Le service garde OpusFocus.exe ouvert : on l'arrête avant de remplacer le fichier.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec('schtasks.exe', '/End /TN "{#HelperTask}"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec('taskkill.exe', '/F /FI "USERNAME eq NT AUTHORITY\SYSTEM" /IM OpusFocus.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;
