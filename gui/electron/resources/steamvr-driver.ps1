# BOBvr: registers (or removes) the slimevr_mod SteamVR driver with vrpathreg.
# -Old: a previous driver folder of this install to unregister first.
param([Parameter(Mandatory = $true)][string]$Driver, [string]$Old = '', [switch]$Remove)
$ErrorActionPreference = 'SilentlyContinue'

# SteamVR's folder: from OpenVR's own paths file, then the Steam uninstall keys, then the default
$runtime = $null
$vrpath = Join-Path $env:LOCALAPPDATA 'openvr\openvrpaths.vrpath'
if (Test-Path $vrpath) { $runtime = (Get-Content $vrpath -Raw | ConvertFrom-Json).runtime | Select-Object -First 1 }
if (-not $runtime) {
	foreach ($key in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 250820',
		'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 250820') {
		$location = (Get-ItemProperty $key).InstallLocation
		if ($location) { $runtime = $location; break }
	}
}
if (-not $runtime) { $runtime = 'C:\Program Files (x86)\Steam\steamapps\common\SteamVR' }

$vrpathreg = Join-Path $runtime 'bin\win64\vrpathreg.exe'
if (-not (Test-Path $vrpathreg)) { Write-Output "vrpathreg introuvable dans $runtime"; exit 1 }

if ($Old) { & $vrpathreg removedriver $Old }
if ($Remove) {
	& $vrpathreg removedriver $Driver
	Write-Output "Pilote retire : $Driver"
} else {
	& $vrpathreg adddriver $Driver
	Write-Output "Pilote ajoute : $Driver"
}
exit 0
