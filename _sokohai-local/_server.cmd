@echo off
rem Inaitwa na ANZISHA-SOKOHAI-LOCAL.bat - server ya SokoHai (functions + frontend) dhidi ya emulator.
title SokoHai Server
cd /d "%~1"
set "FIRESTORE_EMULATOR_HOST=127.0.0.1:8085"
set "FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
set "GCLOUD_PROJECT=demo-sokohai"
set "SUPER_ADMIN_EMAILS=admin@sokohai.test"
set "PORT=5055"
node functions\local-server.js
