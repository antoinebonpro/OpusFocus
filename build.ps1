# Construit dist\OpusFocus.exe (un seul fichier, sans console).
# Usage : powershell -ExecutionPolicy Bypass -File build.ps1
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
    deepwork.py
if ($LASTEXITCODE -ne 0) { throw "Échec de PyInstaller" }

Write-Host "`nOK : $PSScriptRoot\dist\OpusFocus.exe"
