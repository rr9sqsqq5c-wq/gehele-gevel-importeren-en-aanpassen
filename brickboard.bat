@echo off
title Multi-Element IFC Brickstrip Planner — opstarten

echo.
echo ============================================================
echo  Multi-Element IFC Brickstrip Planner
echo  Commit-basis: 584d135 (detectUpAxis majority-vote)
echo ============================================================
echo.

echo [1/4] Lopende processen opruimen...

echo  Vite stoppen op poort 5173...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Vite stoppen op poort 5174...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5174 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Vite stoppen op poort 5200...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5200 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Eventuele vite.js node-processen afsluiten...
taskkill /FI "WINDOWTITLE eq IFC Brickstrip*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Vite Dev*" /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo.
echo [2/4] Naar projectmap navigeren...
cd /d C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-f798

echo  Map: %CD%
echo.

echo [3/4] Vite dev server starten...
start "IFC Brickstrip Planner — Vite Dev" C:\Windows\system32\cmd.exe /k "cd /d C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-f798 && npm run dev"

echo.
echo [4/4] Wachten tot server klaar is (5 sec)...
timeout /t 5 /nobreak >nul

echo  Browser openen op http://localhost:5173 ...
start "" "http://localhost:5173"

echo.
echo ============================================================
echo  Gereed. Server draait in het andere venster.
echo  Sluit het Vite-venster om de server te stoppen.
echo ============================================================
echo.
