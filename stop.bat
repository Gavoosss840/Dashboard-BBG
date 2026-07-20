@echo off
title B. Horizon Capital - Arret...
cd /d "%~dp0"
echo Arret de B. Horizon Capital...
docker compose down
echo.
echo Services arretes.
pause
