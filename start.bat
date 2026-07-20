@echo off
title B. Horizon Capital - Demarrage...
cd /d "%~dp0"

echo ============================================
echo   B. Horizon Capital - Internal Terminal
echo ============================================
echo.

if exist ".git" (
  echo Recuperation des dernieres mises a jour ^(git pull^)...
  for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
  git pull origin %BRANCH%
  if errorlevel 1 (
    echo.
    echo ATTENTION : le git pull a echoue ^(pas de connexion, ou conflit local^).
    echo On continue avec le code deja present sur cette machine.
  )
  echo.
)

echo Demarrage en cours ^(peut prendre 1-2 min la premiere fois, ou apres une mise a jour^)...
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo ERREUR : Docker Desktop est-il bien installe et demarre ?
  pause
  exit /b 1
)

title B. Horizon Capital - En cours d'execution
echo.
echo Pret : http://localhost:3000
echo API  : http://localhost:8000/docs
echo.
echo Pour tout arreter : double-cliquez sur "B. Horizon Capital - Arreter" (Bureau) ou stop.bat

timeout /t 2 >nul
start http://localhost:3000

pause
