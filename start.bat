@echo off
REM Double-clic pour lancer la plateforme (nécessite Docker Desktop installé et démarré).
cd /d "%~dp0"

echo Démarrage de Boulet Capital — Internal Terminal...
docker compose up --build -d

echo.
echo Pret : http://localhost:3000
echo API  : http://localhost:8000/docs
echo.
echo Pour tout arreter : stop.bat

timeout /t 2 >nul
start http://localhost:3000

pause
