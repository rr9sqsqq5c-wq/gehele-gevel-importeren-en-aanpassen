@echo off
cd /d "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1"

echo Vite dev server starten op poort 5200...
start "Vite Dev Server" npx vite --port 5200

echo Wachten tot server klaar is...
timeout /t 3 /nobreak >nul

echo Browser openen...
start "" "http://localhost:5200"

echo.
echo Server draait in achtergrondvenster "Vite Dev Server"
echo Sluit dat venster om de server te stoppen.
pause
