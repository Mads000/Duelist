@echo off
title DUELIST
cd /d "%~dp0"
if not exist node_modules (
  echo Installiere Abhaengigkeiten ...
  call npm install
)
start "" http://localhost:8080
node offline.js
pause
