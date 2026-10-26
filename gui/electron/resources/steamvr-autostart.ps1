# SlimeVR Mod : enregistre SlimeVR Mod comme application SteamVR, pour qu'il
# puisse se lancer tout seul au demarrage de SteamVR.
# Ensuite, dans SteamVR : Reglages > Demarrage/Arret > "Choisir les
# applications au demarrage" (startup overlay apps) > activer SlimeVR Mod.
param(
	[string]$Exe,
	[string]$Arguments = "",
	[string]$ManifestDir,
	[switch]$Remove
)
$ErrorActionPreference = "Stop"
# JSON sans BOM (SteamVR ne lit pas les fichiers avec BOM)
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Dossier de Steam
$steam = (Get-ItemProperty -Path "HKCU:\Software\Valve\Steam" -ErrorAction SilentlyContinue).SteamPath
if (-not $steam) { Write-Host "Steam introuvable."; exit 1 }
$steam = $steam -replace "/", "\"
$appConfig = Join-Path $steam "config\appconfig.json"
$manifest = Join-Path $ManifestDir "slimevr-mod.vrmanifest"

# Liste des manifestes deja enregistres dans SteamVR
$paths = @()
if (Test-Path $appConfig) {
	$json = Get-Content $appConfig -Raw | ConvertFrom-Json
	if ($json.manifest_paths) { $paths = @($json.manifest_paths) }
} else {
	$json = New-Object PSObject
}
$paths = @($paths | Where-Object { $_ -and ($_ -ne $manifest) })

if (-not $Remove) {
	New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
	$app = [ordered]@{
		app_key = "dev.slimevr.mod"
		launch_type = "binary"
		binary_path_windows = $Exe
		arguments = $Arguments
		is_dashboard_overlay = $true
		strings = @{ en_us = @{ name = "SlimeVR Mod"; description = "SlimeVR Mod (BOBvr)" } }
	}
	$doc = [ordered]@{ source = "builtin"; applications = @($app) }
	[System.IO.File]::WriteAllText($manifest, ($doc | ConvertTo-Json -Depth 6), $utf8)
	$paths += $manifest
} elseif (Test-Path $manifest) {
	Remove-Item $manifest -Force
}

$json | Add-Member -NotePropertyName manifest_paths -NotePropertyValue $paths -Force
[System.IO.File]::WriteAllText($appConfig, ($json | ConvertTo-Json -Depth 6), $utf8)
if ($Remove) { Write-Host "SlimeVR Mod retire de SteamVR." } else { Write-Host "SlimeVR Mod enregistre dans SteamVR." }
exit 0
