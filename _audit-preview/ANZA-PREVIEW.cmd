@echo off
REM SokoHai — angalia toleo la ukaguzi (tawi audit/master-engineering-2026-11)
REM Haigusi folda yako kuu: inaunda folda TOFAUTI "sokohai-audit-preview" pembeni yake.
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
where git >nul 2>nul || (echo Git haipo. Sakinisha Git kutoka https://git-scm.com & pause & exit /b 1)
where node >nul 2>nul || (echo Node.js haipo. Sakinisha kutoka https://nodejs.org & pause & exit /b 1)
git fetch "%HERE%sokohai-audit.bundle" audit/master-engineering-2026-11:audit/master-engineering-2026-11 || (echo Imeshindwa kusoma bundle. & pause & exit /b 1)
if not exist "..\sokohai-audit-preview" git worktree add "..\sokohai-audit-preview" audit/master-engineering-2026-11
cd /d "..\sokohai-audit-preview"
echo.
echo Preview inaanza: http://localhost:5057/
echo (Funga dirisha hili kusimamisha server.)
start "" http://localhost:5057/
node tools\dev_server.mjs 5057
pause
