@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title SokoHai - Deploy ya Firebase (functions + rules + indexes)
rem ==========================================================================================
rem  [HARDENING 2026-11-16] Deploy ya Firebase kutoka FOLDA HII (repo iliyo na faili hili).
rem   * Project ID HALISI tu (si "default" wala alias), iliyosajiliwa kwenye
rem     tools\deploy\firebase-targets.json, na lazima iwepo kwenye akaunti yako ya Firebase.
rem   * Inakataa ikiwa functions\ ina .env isiyohusika, service-account JSON, backup n.k.
rem   * Inakataa ikiwa server ya local / emulator bado inaendesha.
rem   * production: lazima uandike  NDIYO PRODUCTION
rem  Haifuti wala kubadilisha faili lolote. Haigusi Netlify, DNS, data wala pesa.
rem  Mwongozo: docs\SOKOHAI-DEPLOY-FIREBASE-HATUA.md
rem ==========================================================================================
for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
set "FBT=firebase-tools@13.35.1"
set "PRE=%ROOT%\tools\deploy\preflight-firebase.mjs"
set "LOG=%ROOT%\deploy-firebase-log.txt"
set "PLIST=%TEMP%\skh-firebase-projects-%RANDOM%%RANDOM%.json"
>>"%LOG%" echo ==== start %DATE% %TIME%

echo.
echo  ======================================================================
echo   TAHADHARI: FUNGA KWANZA server za local (madirisha ya
echo   ANZISHA-SOKOHAI-PILOT, emulator, "node local-server.js").
echo   Deploy itakataa ikiona port 5055/8085/9099/4000/4400/4500/9150/5001 iko wazi.
echo  ======================================================================
echo.
where git >nul 2>nul || ( echo [X] Git haipatikani. & goto :fail )
where node >nul 2>nul || ( echo [X] Node.js haipatikani. & goto :fail )
if not exist "%ROOT%\firebase.json" ( echo [X] firebase.json haipo kwenye %ROOT%. & goto :fail )
if not exist "%PRE%" ( echo [X] %PRE% haipo. & goto :fail )
pause

set "TARGET="
set /p "TARGET=Unadeploy wapi? andika  staging  au  production : "
if /i "%TARGET%"=="staging" goto :askid
if /i "%TARGET%"=="production" goto :askprod
echo [X] Andika staging au production tu.
goto :fail

:askprod
echo.
echo  TAHADHARI: hii ni PRODUCTION - watumiaji halisi.
set "OK="
set /p "OK=Andika  NDIYO PRODUCTION  kuendelea: "
if not "%OK%"=="NDIYO PRODUCTION" ( echo Imesitishwa. & goto :fail )

:askid
set "PROJECT="
set /p "PROJECT=Andika PROJECT ID halisi ya %TARGET% (si alias): "
rem alama za nukuu zinaondolewa; ID yenyewe inathibitishwa na pre-flight kabla ya kutumika popote
if not defined PROJECT ( echo [X] Project ID inahitajika. & goto :fail )
set "PROJECT=%PROJECT:"=%"

echo.
echo [1/5] Ukaguzi wa awali (bila mtandao)...
node "%PRE%" --root "%ROOT%" --target "%TARGET%" --project "%PROJECT%" --phase static
if errorlevel 1 goto :fail
>>"%LOG%" echo target=%TARGET% project=%PROJECT%

echo [2/5] Kuingia Firebase na kuthibitisha mradi upo...
call npx --yes %FBT% login || goto :fail
call npx --yes %FBT% projects:list --json > "%PLIST%" 2>>"%LOG%" || ( echo [X] Imeshindikana kusoma miradi yako ya Firebase. & goto :fail )
node "%PRE%" --root "%ROOT%" --target "%TARGET%" --project "%PROJECT%" --phase full --projects-file "%PLIST%"
set "RC=%ERRORLEVEL%"
del /q "%PLIST%" >nul 2>nul
if not "%RC%"=="0" goto :fail

echo [3/5] Packages za functions...
call npm --prefix "%ROOT%\functions" ci --no-audit --no-fund || goto :fail
call npm --prefix "%ROOT%\functions" run build:shared || goto :fail
node "%PRE%" --root "%ROOT%" --target "%TARGET%" --project "%PROJECT%" --phase static || goto :fail

echo [4/5] Deploy: rules + indexes + functions -^> %PROJECT% (dakika 5-15)...
pushd "%ROOT%"
call npx --yes %FBT% deploy --only firestore:rules,firestore:indexes,functions --project "%PROJECT%" --non-interactive
set "RC=%ERRORLEVEL%"
popd
>>"%LOG%" echo deploy_rc=%RC%
if not "%RC%"=="0" ( echo [X] Deploy imeshindwa - angalia ujumbe hapo juu. & goto :fail )

echo [5/5] IMEKAMILIKA: %PROJECT% sasa ina functions + rules za toleo hili.
echo  Ifuatayo: Admin - Muhtasari - Usanidi wa nje - "Endesha sasa" (utafutaji), system/config, PITR.
>>"%LOG%" echo ok %DATE% %TIME%
pause
exit /b 0

:fail
if exist "%PLIST%" del /q "%PLIST%" >nul 2>nul
>>"%LOG%" echo FAIL %DATE% %TIME%
echo.
echo  Imesimama - hakuna kilichopakiwa baada ya hatua iliyoshindwa.
pause
exit /b 1
