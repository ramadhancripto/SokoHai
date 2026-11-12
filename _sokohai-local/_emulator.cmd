@echo off
rem Inaitwa na ANZISHA-SOKOHAI-LOCAL.bat - Firebase Emulator (Firestore + Auth), project ya majaribio tu.
title SokoHai Emulator
cd /d "%~1"
for /d %%D in ("%USERPROFILE%\.jdks\*") do if exist "%%D\bin\java.exe" if not defined JAVA_HOME set "JAVA_HOME=%%D"
where java >nul 2>nul || if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
call npx --yes %~2 emulators:start --only firestore,auth --project demo-sokohai
