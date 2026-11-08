@echo off
setlocal
chcp 65001 >nul
title SokoHai - Ukaguzi wa production (READ-ONLY)
rem ================================================================
rem  Ukaguzi wa SOMA-TU (read-only) wa data halisi ya SokoHai.
rem  * Hakuna kuandika: script inazuia set/update/delete/batch/transaction.
rem  * Inatoa idadi na ID za nyaraka tu - hakuna majina wala namba za simu.
rem  * Inatumia ruhusa zako mwenyewe:  gcloud auth application-default login
rem ================================================================
cd /d "%~dp0..\.."
set "PROJECT=%~1"
if "%PROJECT%"=="" set "PROJECT=sokonet-3b847"
set "FIRESTORE_EMULATOR_HOST="
set "OUT=production-readonly-audit-%DATE:~-4%%DATE:~3,2%%DATE:~0,2%.json"
echo Project: %PROJECT%   (read-only)
node tools\production_readonly_audit.mjs --allow-production-read --project %PROJECT% --report "%OUT%" || goto :fail
echo.
echo Ripoti imehifadhiwa: %CD%\%OUT%
echo Tuma faili hilo kwa Claude kwa uchambuzi. Hakuna kilichobadilishwa.
pause
exit /b 0
:fail
echo Ukaguzi umeshindwa (mara nyingi ni ruhusa: endesha "gcloud auth application-default login").
pause
exit /b 1
