@echo off
title Smart Bill Auditor - Local Server
echo ====================================================
echo Starting Smart Bill Auditor on http://localhost:3000
echo ====================================================
echo.
echo Press Ctrl+C in this terminal window to stop the server.
echo.

rem Try Node.js first
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  start "" http://localhost:3000
  node server.js
  goto end
)

rem Try Python as fallback
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  start "" http://localhost:3000
  python -m http.server 3000
  goto end
)

echo Neither Node.js nor Python was found.
echo You can open index.html or tests directly in your browser.
pause

:end
