@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo   MetrixIQ - clean Windows launcher
echo ==========================================
echo.
if not exist package.json (
  echo ERROR: package.json is not in this folder.
  echo Extract the ZIP again and run START-HERE.bat from the extracted folder.
  pause
  exit /b 1
)
findstr /c:"\"dev\": \"next dev\"" package.json >nul
if errorlevel 1 (
  echo ERROR: The MetrixIQ package.json is not the expected file.
  pause
  exit /b 1
)
if exist .next rmdir /s /q .next
if not exist node_modules (
  echo [1/2] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Dependencies already installed.
)
echo [2/2] Starting MetrixIQ...
call npm run dev
pause
