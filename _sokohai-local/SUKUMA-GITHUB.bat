@echo off
setlocal EnableExtensions
chcp 65001 >nul
title SokoHai - Sukuma tawi la remediation GitHub

rem ================================================================
rem  Inaweka kazi yote (commits 29, bc3d147..0345acd) kwenye repo yako
rem  na kuisukuma GitHub kama TAWI TOFAUTI:
rem      remediation/audit-findings-2026-11
rem  * Haigusi tawi lako la main, haifanyi merge.
rem  * Inakuuliza kwanza kabla ya kusukuma (push ni uamuzi wako).
rem ================================================================

set "PKG=%~dp0"
for %%I in ("%PKG%..") do set "REPO=%%~fI"
set "BR=remediation/audit-findings-2026-11"
set "REF=refs/remotes/sokohai-bundle/remediation"

where git >nul 2>nul || ( echo [X] Git haipatikani. Sakinisha: https://git-scm.com & goto :fail )
git -C "%REPO%" rev-parse --git-dir >nul 2>nul || ( echo [X] "%REPO%" si repo ya git. & goto :fail )

echo.
echo  Repo: %REPO%
echo.
echo [1/4] Kukagua bundle...
git -C "%REPO%" bundle verify "%PKG%sokohai-remediation.bundle" || ( echo [X] Bundle haikubaliki ^(repo inahitaji commit bc3d147^). & goto :fail )

echo [2/4] Kuleta commits kutoka kwenye bundle...
git -C "%REPO%" fetch "%PKG%sokohai-remediation.bundle" "+refs/heads/%BR%:%REF%" || goto :fail
echo.
echo  Commit ya juu kabisa:
git -C "%REPO%" log -1 --oneline %REF%
echo  Idadi ya commits juu ya bc3d147:
git -C "%REPO%" rev-list --count bc3d147..%REF%

echo.
echo [3/4] Remote ya GitHub:
git -C "%REPO%" remote -v
git -C "%REPO%" remote get-url origin >nul 2>nul || ( echo [X] Hakuna remote "origin". Ongeza: git remote add origin https://github.com/JINA/REPO.git & goto :fail )

echo.
set "ANS="
set /p "ANS=Sukuma tawi %BR% kwenda origin sasa? (N/Y): "
if /i not "%ANS%"=="Y" ( echo Sijasukuma. Unaweza kurudia baadaye. & goto :end )

echo [4/4] Inasukuma...
git -C "%REPO%" push -u origin "%REF%:refs/heads/%BR%" || ( echo [X] Push imeshindwa ^(angalia login ya GitHub / ruhusa^). & goto :fail )
echo.
echo [OK] Tawi %BR% liko GitHub. Fungua Pull Request kwenye GitHub ukitaka kuunganisha na main.
goto :end

:fail
echo.
echo Imeshindwa. Hakuna kilichobadilishwa kwenye tawi lako la main.
:end
echo.
pause
