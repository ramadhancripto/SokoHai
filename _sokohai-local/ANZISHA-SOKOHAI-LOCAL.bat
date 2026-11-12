@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title SokoHai - Local Server (Emulator)

rem ================================================================
rem  SokoHai - mfumo halisi kwenye kompyuta yako (Firebase Emulator)
rem  * Code ni ya tawi remediation/audit-findings-2026-11.
rem  * Data ni ya EMULATOR (demo-sokohai) - production HAIGUSWI.
rem  * Folda yako kuu (main) haibadilishwi: tawi linawekwa kwenye
rem    folda tofauti "sokohai-remediation" pembeni yake.
rem ================================================================

set "PKG=%~dp0"
for %%I in ("%PKG%..") do set "REPO=%%~fI"
for %%I in ("%REPO%\..\sokohai-remediation") do set "WT=%%~fI"
set "BR=remediation/audit-findings-2026-11"
set "FBT=firebase-tools@13.35.1"

echo.
echo  SokoHai Local - kuanzisha...
echo  Repo yako : %REPO%
echo  Folda mpya: %WT%
echo.

rem ---------- 1. Vitu vinavyohitajika ----------
where git >nul 2>nul || ( echo [X] Git haipatikani. Sakinisha: https://git-scm.com & goto :fail )
where node >nul 2>nul || ( echo [X] Node.js haipatikani. Sakinisha Node 20 LTS: https://nodejs.org & goto :fail )
where java >nul 2>nul || call :findjava
where java >nul 2>nul || ( echo [X] Java 11 au zaidi haipatikani. Sakinisha: https://adoptium.net  ^(Temurin 21^) & goto :fail )
where curl >nul 2>nul || ( echo [X] curl haipatikani ^(Windows 10/11 inayo kwa kawaida^). & goto :fail )
for /f "tokens=*" %%V in ('node -v') do echo  Node %%V
for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do echo  Java %%V

rem ---------- 2. Leta tawi la remediation kutoka kwenye bundle ----------
echo.
echo [1/6] Inaleta tawi la remediation...
git -C "%REPO%" fetch "%PKG%sokohai-remediation.bundle" "+refs/heads/%BR%:refs/remotes/sokohai-bundle/remediation" || ( echo [X] Bundle haikuweza kusomwa ^(je repo yako ina commit bc3d147?^). & goto :fail )
if exist "%WT%\.git" (
  git -C "%WT%" merge --ff-only refs/remotes/sokohai-bundle/remediation || ( echo [X] Folda %WT% ina mabadiliko yako; sikuibadilisha. & goto :fail )
) else (
  git -C "%REPO%" worktree add -B "%BR%" "%WT%" refs/remotes/sokohai-bundle/remediation || goto :fail
)
for /f "tokens=*" %%H in ('git -C "%WT%" rev-parse --short HEAD') do echo  HEAD %%H

rem ---------- 3. Packages za functions ----------
echo.
echo [2/6] Inasakinisha packages za functions ^(mara ya kwanza inaweza kuchukua dakika kadhaa^)...
call npm --prefix "%WT%\functions" install --no-audit --no-fund || goto :fail

rem ---------- 4. Firebase Emulator ----------
echo.
echo [3/6] Inaanzisha Firebase Emulator ^(dirisha jipya^)...
curl -s -o nul http://127.0.0.1:8085/ && ( echo  Emulator tayari inaendesha. ) || start "SokoHai Emulator" cmd /k call "%PKG%_emulator.cmd" "%WT%" "%FBT%"
set /a N=0
:waitemu
set /a N+=1
curl -s -o nul http://127.0.0.1:8085/ && curl -s -o nul http://127.0.0.1:9099/ && goto :emuok
if !N! GEQ 120 ( echo [X] Emulator haikuanza ndani ya dakika 4 - angalia dirisha la "SokoHai Emulator". & goto :fail )
timeout /t 2 /nobreak >nul
goto :waitemu
:emuok
echo  Emulator iko tayari ^(Firestore 8085, Auth 9099^).

rem ---------- 5. Server ya SokoHai ----------
echo.
echo [4/6] Inaanzisha server ya SokoHai ^(dirisha jipya^)...
curl -s -o nul http://localhost:5055/ && ( echo  Server tayari inaendesha. ) || start "SokoHai Server" cmd /k call "%PKG%_server.cmd" "%WT%"
set /a N=0
:waitsrv
set /a N+=1
curl -s -o nul http://localhost:5055/ && goto :srvok
if !N! GEQ 60 ( echo [X] Server haikuanza - angalia dirisha la "SokoHai Server". & goto :fail )
timeout /t 2 /nobreak >nul
goto :waitsrv
:srvok

rem ---------- 6. Akaunti na data ya demo ----------
echo.
echo [5/6] Inaweka akaunti na data ya demo kwenye emulator...
set "FIRESTORE_EMULATOR_HOST=127.0.0.1:8085"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "GCLOUD_PROJECT=demo-sokohai"
node "%WT%\tools\local-demo-seed.mjs" || goto :fail

echo.
echo [6/6] Inafungua http://localhost:5055 ...
start "" http://localhost:5055
echo.
echo  ============================================================
echo   SokoHai inaendesha:  http://localhost:5055
echo   Nenosiri la akaunti zote za demo: SokoHai-Local-2026
echo   Kusimamisha: funga madirisha "SokoHai Server" na "SokoHai Emulator".
echo  ============================================================
pause
exit /b 0

:findjava
for /d %%D in ("%USERPROFILE%\.jdks\*") do if exist "%%D\bin\java.exe" set "JAVA_HOME=%%D"
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
exit /b 0

:fail
echo.
echo  Kuanzisha kumeshindwa. Soma ujumbe hapo juu, kisha jaribu tena.
pause
exit /b 1
