# Construit l'APK Android d'OpusFocus (signé avec la clé de débogage, installable directement).
#
# Windows limite les chemins à 260 caractères et la compilation C++ de React Native les dépasse depuis
# « C:\Users\...\Desktop\DEEP Work\mobile ». On compile donc dans une copie à un chemin court (C:\opusfocus),
# puis l'APK est recopié dans mobile\dist\ et dans le dossier dist\ du projet.
#
# Usage : powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 [-Test]
#   -Test : lance aussi les tests unitaires du module natif (filtrage DNS).
param([switch]$Test)
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$work = "C:\opusfocus"

# Copie miroir. Chemins complets : un simple nom exclurait aussi les dossiers android/dist de node_modules.
# Le dossier android de la copie est régénéré par prebuild à partir d'app.json (nom, paquet, icônes).
robocopy $src $work /MIR /XD "$src\android" "$src\dist" "$src\.expo" "$work\android" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a échoué ($LASTEXITCODE)" }

Push-Location $work
try {
  $env:CI = "1"
  npx expo prebuild --platform android --clean --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild a échoué" }
  Push-Location android
  if ($Test) {
    .\gradlew.bat :focus-blocker:testDebugUnitTest --console=plain
    if ($LASTEXITCODE -ne 0) { throw "les tests du module natif ont échoué" }
  }
  .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64" `
    "-Pkotlin.compiler.execution.strategy=in-process" --console=plain
  if ($LASTEXITCODE -ne 0) { throw "la compilation Gradle a échoué" }
  Pop-Location
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force "$src\dist", "$src\..\dist" | Out-Null
Copy-Item "$work\android\app\build\outputs\apk\release\app-release.apk" "$src\dist\OpusFocus.apk" -Force
Copy-Item "$work\android\app\build\outputs\apk\release\app-release.apk" "$src\..\dist\OpusFocus.apk" -Force
Get-Item "$src\dist\OpusFocus.apk"
