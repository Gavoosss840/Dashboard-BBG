@echo off
title Boulet Capital - Installation des raccourcis
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\create-shortcuts.ps1"
echo.
pause
