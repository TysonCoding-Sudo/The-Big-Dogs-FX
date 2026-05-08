@echo off
title THE BIG DOGS FX - Server
echo.
echo ===============================================
echo    THE BIG DOGS FX - Starting Server
echo ===============================================
echo.

REM Check if .env exists
if not exist backend\.env (
    echo Creating .env from example...
    copy backend\.env.example backend\.env
)

echo Starting Backend server...
echo Open http://localhost:5000 to test API
echo.

cd backend
call npm start

pause
