# Liste les applications installées (menu Démarrer + Microsoft Store) au format JSON.
# Chaque entrée : name, exe (nom du processus), path, kind (desktop|store), icon (PNG base64 ou vide).
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

function Get-IconB64([string]$path) {
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
        $bmp = $icon.ToBitmap()
        $ms = New-Object IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        return [Convert]::ToBase64String($ms.ToArray())
    } catch { return '' }
}

$out = New-Object System.Collections.ArrayList
$shell = New-Object -ComObject WScript.Shell
$dirs = @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
          "$env:APPDATA\Microsoft\Windows\Start Menu\Programs")
foreach ($d in $dirs) {
    Get-ChildItem $d -Recurse -Filter *.lnk | ForEach-Object {
        $target = $shell.CreateShortcut($_.FullName).TargetPath
        if ($target -and $target.ToLower().EndsWith('.exe') -and (Test-Path $target)) {
            [void]$out.Add([pscustomobject]@{
                name = $_.BaseName; exe = [IO.Path]::GetFileName($target).ToLower()
                path = $target; kind = 'desktop'; icon = (Get-IconB64 $target)
            })
        }
    }
}

$start = @{}
Get-StartApps | ForEach-Object { $start[$_.AppID] = $_.Name }
Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' } | ForEach-Object {
    $pkg = $_
    $manifest = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
    if (-not (Test-Path $manifest)) { return }
    $xml = [xml](Get-Content $manifest -Raw)
    foreach ($app in $xml.Package.Applications.Application) {
        $id = "$($pkg.PackageFamilyName)!$($app.Id)"
        if ($app.Executable -and $start.ContainsKey($id)) {
            $icon = ''
            $logo = $xml.Package.Properties.Logo
            if ($logo) {
                $base = Join-Path $pkg.InstallLocation ([IO.Path]::GetDirectoryName($logo))
                $stem = [IO.Path]::GetFileNameWithoutExtension($logo)
                $file = Get-ChildItem $base -Filter "$stem*.png" | Sort-Object Length | Select-Object -First 1
                if ($file) { $icon = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName)) }
            }
            [void]$out.Add([pscustomobject]@{
                name = $start[$id]; exe = [IO.Path]::GetFileName($app.Executable).ToLower()
                path = $pkg.InstallLocation; kind = 'store'; icon = $icon
            })
        }
    }
}
$out | ConvertTo-Json -Compress
