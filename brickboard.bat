@echo off
title BrickBoard — opstarten
cd /d "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-f798"

echo.
echo ============================================================
echo  BrickBoard IFC Planner
echo ============================================================
echo.

echo [1/4] Lopende Vite-processen stoppen...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 "') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5174 "') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5200 "') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/4] IndexedDB cache wissen via Edge...
rem Schrijf een tijdelijk JS-snippet dat de cache leeggooit via een data-URL
rem Edge ondersteunt --app met --enable-automation niet altijd, dus we gebruiken
rem een aparte opstart-pagina die de cache wist en dan doorverwijst.
set CLEAR_HTML=%TEMP%\brickboard_clear_cache.html
(
  echo ^<html^>^<body^>^<script^>
  echo   var req = indexedDB.deleteDatabase^('ifc-planner'^);
  echo   req.onsuccess = function^(^) { window.location.href = 'http://localhost:5173'; };
  echo   req.onerror   = function^(^) { window.location.href = 'http://localhost:5173'; };
  echo   req.onblocked = function^(^) { window.location.href = 'http://localhost:5173'; };
  echo   setTimeout^(function^(^){ window.location.href = 'http://localhost:5173'; }, 2000^);
  echo ^</script^>^</body^>^</html^>
) > "%CLEAR_HTML%"

echo [3/4] Vite dev server starten...
start "BrickBoard — Vite Dev" cmd /k "cd /d C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-f798 && npx vite"

echo [4/4] Wachten en browser openen...
timeout /t 4 /nobreak >nul

rem Open de cache-wis pagina — die stuurt automatisch door naar localhost:5173
start "" "file://%CLEAR_HTML%"

echo.
echo ============================================================
echo  Server draait. Cache wordt gewist bij opstarten.
echo  Sluit het Vite-venster om te stoppen.
echo ============================================================
echo.
