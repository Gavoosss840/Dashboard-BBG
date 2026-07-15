@echo off
title Boulet Capital - Arret...
cd /d "%~dp0"
echo Arret de Boulet Capital...
docker compose down
echo.
echo Services arretes.
pause
