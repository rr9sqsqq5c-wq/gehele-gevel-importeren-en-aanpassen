@echo off
cd /d "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1"

echo Bestaand Vite-proces stoppen op poort 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Vite dev server starten op poort 5173...
start "IFC Brickstrip Planner - Server" "C:\Program Files\nodejs\npm.cmd" run dev

echo Wachten tot server klaar is...
timeout /t 4 /nobreak >nul

echo Browser openen...
start "" "http://localhost:5173"
