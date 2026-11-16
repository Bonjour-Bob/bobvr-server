; Etapes en plus pour l'installeur de VitalVR

; Avant d'installer : si VitalVR est deja installe, l'installeur le met a
; jour (meme appId). Il faut juste que rien ne bloque ses fichiers.
!macro customInit
  ; Le serveur Java de VitalVR peut encore tourner (icone pres de l'horloge)
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process java,javaw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '*VitalVR*' } | Stop-Process -Force"`
  Pop $0

  ; SteamVR garde le pilote SlimeVR ouvert : il faut le fermer
  vitalvr_steamvr_check:
  nsExec::Exec `powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process vrserver,vrmonitor -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"`
  Pop $0
  StrCmp $0 "1" 0 vitalvr_steamvr_ok
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "SteamVR est ouvert.$\r$\n$\r$\nFerme SteamVR, puis clique sur Recommencer." IDRETRY vitalvr_steamvr_check
    Quit
  vitalvr_steamvr_ok:
!macroend

!macro customInstall
  ; Pas d'installation de pilote : VitalVR utilise le pilote v21 "slimevr_09"
  ; Appli SteamVR : permet de lancer VitalVR au demarrage de SteamVR
  DetailPrint "Enregistrement de VitalVR dans SteamVR..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-autostart.ps1" -Exe "$INSTDIR\VitalVR.exe" -ManifestDir "$INSTDIR"`
  Pop $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\steamvr-autostart.ps1" -ManifestDir "$INSTDIR" -Remove`
  Pop $0
!macroend
