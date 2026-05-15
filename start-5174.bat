@echo off
cd /d "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1"

echo Bestaand Vite-proces stoppen op poort 5174...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Vite dev server starten op poort 5174...
start "IFC Brickstrip Planner - Kopie f798" "C:\Program Files\nodejs\npm.cmd" run dev -- --port 5174

echo Wachten tot server klaar is...
timeout /t 4 /nobreak >nul

echo Browser openen...
start "" "http://localhost:5174"
