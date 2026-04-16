@echo off
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul
start "" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/"
