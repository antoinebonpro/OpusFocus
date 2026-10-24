# Construit dist\OpusFocus.exe (un seul fichier, sans console), puis l'installateur dist\OpusFocus-Setup.exe.
# Usage : powershell -ExecutionPolicy Bypass -File build.ps1
# L'installateur nécessite Inno Setup 6 : winget install JRSoftware.InnoSetup --source winget --scope user
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venv = ".venv-build"
if (-not (Test-Path "$venv\Scripts\python.exe")) {
    python -m venv $venv
}
$py = "$venv\Scripts\python.exe"
& $py -m pip install --quiet --disable-pip-version-check pyinstaller pillow
& $py build\make_icon.py

& $py -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name OpusFocus `
    --icon "$PSScriptRoot\build\icon.ico" `
    --add-data "$PSScriptRoot\ui;ui" `
    --add-data "$PSScriptRoot\scan_apps.ps1;." `
    --distpath dist --workpath build\tmp --specpath build\tmp `
    opusfocus.py
if ($LASTEXITCODE -ne 0) { throw "Échec de PyInstaller" }
Write-Host "`nOK : $PSScriptRoot\dist\OpusFocus.exe"

$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    Write-Warning "Inno Setup introuvable : l'installateur n'est pas construit."
    exit 0
}
& $iscc /Q "$PSScriptRoot\installer\OpusFocus.iss"
if ($LASTEXITCODE -ne 0) { throw "Échec de la construction de l'installateur" }
Write-Host "OK : $PSScriptRoot\dist\OpusFocus-Setup.exe"
