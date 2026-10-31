@echo off
rem Starts the local-only game server (127.0.0.1:3000) and opens the game in Brave with the
rem profile that holds the imported game files. Nothing is reachable from other computers.
cd /d D:\mkw-web

rem Start the server unless it is already running.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:3000/play.html | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "MKW server (close this window to stop it)" /min "D:\mkw-web\emsdk\node\24.19.0_64bit\node.exe" "D:\mkw-web\web\server\server.mjs"
  timeout /t 2 /nobreak >nul
)

start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --user-data-dir="D:\mkw-web\web\brave-profile" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 http://localhost:3000/play.html
