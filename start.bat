@echo off
title Boulet Capital - Demarrage...
cd /d "%~dp0"

echo ============================================
echo   Boulet Capital - Internal Terminal
echo   Demarrage en cours (peut prendre 1-2 min
echo   la premiere fois)...
echo ============================================
echo.

docker compose up --build -d
if errorlevel 1 (
  echo.
  echo ERREUR : Docker Desktop est-il bien installe et demarre ?
  pause
  exit /b 1
)

title Boulet Capital - En cours d'execution
echo.
echo Pret : http://localhost:3000
echo API  : http://localhost:8000/docs
echo.
echo Pour tout arreter : double-cliquez sur "Boulet Capital - Arreter" (Bureau) ou stop.bat

timeout /t 2 >nul
start http://localhost:3000

pause
