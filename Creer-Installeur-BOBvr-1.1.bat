@echo off
setlocal
title Creation de l'installeur BOBvr 1.1
set "SRC=%USERPROFILE%\BOBvr-1.1"
set "REPO=https://github.com/Bonjour-Bob/bobvr-server"
set "BRANCH=bobvr-1.1"
set "TOOLS=%USERPROFILE%\BOBvr-outils"
set "BM=%SRC%\gui\electron\build-mod"
set "OUT=%USERPROFILE%\Desktop\SlimeVR Mod - Installeur"
set "JDK_URL=https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
set "DRIVER_URL=https://github.com/SlimeVR/SlimeVR-OpenVR-Driver/releases/latest/download/slimevr-openvr-driver-win64.zip"
set "BINDINGS_URL=https://github.com/SlimeVR/SlimeVR-Server/releases/download/v22.0.0-rc.2/SlimeVR-win64.zip"
set "HUSKY=0"

echo === Creation de l'installeur BOBvr 1.1 (SlimeVR Mod) ===
echo Ca prend plusieurs minutes (beaucoup plus la premiere fois).
echo Ferme SlimeVR avant de continuer.
pause

echo.
echo [1/8] Recuperation du code BOBvr 1.1 depuis GitHub...
if exist "%SRC%\.git" (
  git -C "%SRC%" fetch origin %BRANCH% || goto :err
  git -C "%SRC%" checkout -f %BRANCH% || goto :err
  git -C "%SRC%" reset --hard origin/%BRANCH% || goto :err
) else (
  git clone --branch %BRANCH% "%REPO%" "%SRC%" || goto :err
)
git -C "%SRC%" submodule update --init --recursive || goto :err

rem La video de Bob n'est pas sur GitHub : on la prend dans l'ancien dossier
if not exist "%SRC%\gui\app\public\videos\bob-danse.webm" (
  copy /y "%USERPROFILE%\SlimeVR-Server\gui\public\videos\bob-danse.webm" "%SRC%\gui\app\public\videos\" >nul
)

echo.
echo [2/8] Java 25 (pour construire le serveur)...
if not exist "%TOOLS%" mkdir "%TOOLS%"
if exist "%TOOLS%\jdk25\bin\java.exe" goto :jdkok
if exist "%TOOLS%\jdk-tmp" rmdir /s /q "%TOOLS%\jdk-tmp"
mkdir "%TOOLS%\jdk-tmp"
curl.exe -L -f -o "%TOOLS%\jdk25.zip" "%JDK_URL%" || goto :err
tar -xf "%TOOLS%\jdk25.zip" -C "%TOOLS%\jdk-tmp" || goto :err
for /d %%D in ("%TOOLS%\jdk-tmp\*") do move "%%D" "%TOOLS%\jdk25" >nul
rmdir /s /q "%TOOLS%\jdk-tmp"
del "%TOOLS%\jdk25.zip"
if not exist "%TOOLS%\jdk25\bin\java.exe" goto :err
:jdkok
set "JAVA_HOME=%TOOLS%\jdk25"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo.
echo [3/8] Construction du serveur (Java)...
cd /d "%SRC%" || goto :err
call gradlew.bat :server:desktop:shadowJar
if errorlevel 1 goto :err
if not exist "server\desktop\build\libs\slimevr.jar" goto :err

echo.
echo [4/8] Construction de l'interface...
call npx -y pnpm@12.3.4 i
if errorlevel 1 goto :err
call npx -y pnpm@12.3.4 run build
if errorlevel 1 goto :err

if not exist "%BM%" mkdir "%BM%"

echo.
echo [5/8] Java embarque dans l'installeur...
if exist "%BM%\jre" rmdir /s /q "%BM%\jre"
"%JAVA_HOME%\bin\jlink.exe" --add-modules ALL-MODULE-PATH --strip-debug --no-header-files --no-man-pages --output "%BM%\jre"
if exist "%BM%\jre\bin\java.exe" goto :jreok
rem jlink ne marche pas avec ce Java : on copie Java en entier (plus gros, meme resultat)
echo jlink indisponible, copie complete de Java...
if exist "%BM%\jre" rmdir /s /q "%BM%\jre"
xcopy "%JAVA_HOME%" "%BM%\jre\" /e /i /q /y >nul
if not exist "%BM%\jre\bin\java.exe" goto :err
:jreok

echo.
echo [6/8] Liaisons SteamVR (prises dans SlimeVR v22 rc.2 officiel)...
if exist "%BM%\bindings\SlimeVR-Bindings-Provider.exe" if exist "%BM%\bindings\openvr_api.dll" goto :bindingsok
if exist "%BM%\bindings-zip" rmdir /s /q "%BM%\bindings-zip"
mkdir "%BM%\bindings-zip"
if not exist "%BM%\bindings" mkdir "%BM%\bindings"
curl.exe -L -f -o "%BM%\bindings.zip" "%BINDINGS_URL%" || goto :err
tar -xf "%BM%\bindings.zip" -C "%BM%\bindings-zip" || goto :err
for /r "%BM%\bindings-zip" %%F in (SlimeVR-Bindings-Provider.exe openvr_api.dll) do if exist "%%F" copy /y "%%F" "%BM%\bindings\" >nul
rmdir /s /q "%BM%\bindings-zip"
del "%BM%\bindings.zip"
if not exist "%BM%\bindings\SlimeVR-Bindings-Provider.exe" goto :err
if not exist "%BM%\bindings\openvr_api.dll" goto :err
:bindingsok

echo.
echo [7/8] Pilote SteamVR...
if exist "%BM%\slimevr-openvr-driver-win64\driver.vrdrivermanifest" goto :driverok
if exist "%BM%\driver-zip" rmdir /s /q "%BM%\driver-zip"
mkdir "%BM%\driver-zip"
curl.exe -L -f -s -o "%BM%\driver.zip" "%DRIVER_URL%" || goto :err
tar -xf "%BM%\driver.zip" -C "%BM%\driver-zip" || goto :err
if not exist "%BM%\driver-zip\slimevr\driver.vrdrivermanifest" goto :err
move "%BM%\driver-zip\slimevr" "%BM%\slimevr-openvr-driver-win64" >nul
rmdir /s /q "%BM%\driver-zip"
:driverok

echo.
echo [8/8] Creation de l'installeur...
cd /d "%SRC%\gui\electron" || goto :err
rem Numero de version = date et heure, pour que l'installeur mette a jour
rem la version deja installee (SlimeVR Mod 0.9 compris)
set "VER="
for /f %%V in ('powershell -NoProfile -Command "$d=Get-Date; '{0}.{1}.{2}' -f ($d.Year-2000), ($d.Month*100+$d.Day), ($d.Hour*100+$d.Minute)"') do set "VER=%%V"
if not defined VER set "VER=1.1.0"
for /d %%D in ("dist\mod-*") do rmdir /s /q "%%~D" >nul 2>&1
set "DIST=dist\mod-%VER%"
call npx -y pnpm@12.3.4 exec electron-builder --win --config electron-builder-mod.yml -c.extraMetadata.version=%VER% -c.directories.output=%DIST% --publish never
if errorlevel 1 goto :err
if not exist "%DIST%\SlimeVR-Mod-Installeur.exe" goto :err

if not exist "%OUT%" mkdir "%OUT%"
copy /y "%DIST%\SlimeVR-Mod-Installeur.exe" "%OUT%\" >nul
if errorlevel 1 goto :err

echo.
echo Termine ! L'installeur BOBvr 1.1 est dans "SlimeVR Mod - Installeur" sur ton Bureau.
echo Ferme SteamVR, puis lance-le : il remplace SlimeVR Mod 0.9 (tes reglages sont gardes).
explorer "%OUT%"
pause
exit /b 0

:err
echo.
echo Une erreur est survenue. Fais une capture de cette fenetre et envoie-la.
pause
exit /b 1
