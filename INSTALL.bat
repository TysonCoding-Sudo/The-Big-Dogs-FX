@echo off
title THE BIG DOGS FX - Setup & Run
echo.
echo ===============================================
echo    THE BIG DOGS FX - We chase the cash
echo ===============================================
echo.

echo [1/3] Installing Backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Backend install failed
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Installing App dependencies...
cd "The Big Dogs Fx"
call npm install
if %errorlevel% neq 0 (
    echo WARNING: App install had issues (some dependencies are optional)
)
cd ..

echo.
echo [3/3] Creating .env file...
if not exist backend\.env (
    copy backend\.env.example backend\.env
    echo .env file created - edit backend\.env to configure
)

echo.
echo ===============================================
echo    INSTALLATION COMPLETE!
echo ===============================================
echo.
echo To start the servers:
echo   1. Double-click RUN_SERVERS.bat
echo   2. Open web-app\index.html in your browser
echo.
echo To build mobile apps (Android/iOS):
echo   1. Create account at expo.dev
echo   2. Run: npx eas login
echo   3. Run: npx eas build --platform android --profile preview
echo.
pause
