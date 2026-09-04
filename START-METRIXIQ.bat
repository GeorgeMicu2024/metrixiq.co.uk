@echo off
cd /d "%~dp0"
echo.
echo =========================================
echo   MetrixIQ - Stable CSS Build
 echo =========================================
echo.
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
echo Starting MetrixIQ...
call npm run dev
pause
