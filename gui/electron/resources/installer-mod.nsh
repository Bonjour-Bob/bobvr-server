; Etapes en plus pour l'installeur de SlimeVR Mod

; Avant d'installer : si SlimeVR Mod est deja installe, l'installeur le met a
; jour (meme appId). Il faut juste que rien ne bloque ses fichiers.
!macro customInit
  ; Le serveur Java de SlimeVR Mod peut encore tourner (icone pres de l'horloge)
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process java,javaw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '*SlimeVR Mod*' } | Stop-Process -Force"`
  Pop $0

  ; SteamVR garde le pilote SlimeVR ouvert : il faut le fermer
  slimevrmod_steamvr_check:
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process vrserver,vrmonitor -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"`
  Pop $0
  StrCmp $0 "1" 0 slimevrmod_steamvr_ok
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "SteamVR est ouvert.$\r$\n$\r$\nFerme SteamVR, puis clique sur Recommencer." IDRETRY slimevrmod_steamvr_check
    Quit
  slimevrmod_steamvr_ok:
!macroend

!macro customInstall
  ; Pilote SteamVR "slimevr_mod", a part du pilote "slimevr" de SlimeVR officiel
  ; (les deux apparaissent dans les extensions de SteamVR, on active celui qu'on veut)
  DetailPrint "Enregistrement du pilote SteamVR slimevr_mod..."
  SetOutPath "$INSTDIR"
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-driver.ps1" -Driver "$INSTDIR\slimevr_mod" -Old "$INSTDIR\slimevr-openvr-driver-win64"`
  Pop $0
  DetailPrint "Pilote SteamVR : code $0"

  ; Appli SteamVR : permet de lancer SlimeVR Mod au demarrage de SteamVR
  DetailPrint "Enregistrement de SlimeVR Mod dans SteamVR..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-autostart.ps1" -Exe "$INSTDIR\SlimeVR Mod.exe" -ManifestDir "$INSTDIR"`
  Pop $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-driver.ps1" -Driver "$INSTDIR\slimevr_mod" -Remove`
  Pop $0
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-autostart.ps1" -ManifestDir "$INSTDIR" -Remove`
  Pop $0
!macroend
