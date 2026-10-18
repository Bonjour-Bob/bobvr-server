; Etapes en plus a l'installation de SlimeVR Mod
!macro customInstall
  DetailPrint "Enregistrement du pilote SteamVR de SlimeVR..."
  SetOutPath "$INSTDIR"
  nsExec::ExecToLog '"$INSTDIR\jre\bin\java.exe" -jar "$INSTDIR\slimevr.jar" --install'
  Pop $0
  DetailPrint "Pilote SteamVR : code $0"
!macroend
