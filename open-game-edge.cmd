@echo off
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "GAME=http://127.0.0.1:5173/index.html?fresh=%RANDOM%%RANDOM%"
set "PROFILE=%~dp0edge-fresh-profile"
cd /d "%~dp0"

start "Flower Lantern Valley Server" /min py -m http.server 5173 --bind 127.0.0.1
timeout /t 2 /nobreak >nul

if exist "%EDGE%" (
  start "" "%EDGE%" --new-window --disable-application-cache --disk-cache-size=1 --user-data-dir="%PROFILE%" "%GAME%"
) else (
  start "" "%GAME%"
)
