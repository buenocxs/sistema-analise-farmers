@echo off
chcp 65001 >nul 2>&1
title MAVE - Parando servicos

echo ============================================
echo   MAVE Monitoring - Parando todos servicos
echo ============================================
echo.

:: --- Parar processos na porta 8080 (Evolution API) ---
echo [1/2] Parando Evolution API (porta 8080)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8080 "') do (
    echo       Matando PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: --- Parar processos na porta 3000 (Frontend) ---
echo [2/2] Parando Frontend (porta 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000 "') do (
    echo       Matando PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ============================================
echo   Todos os servicos foram parados.
echo ============================================
echo.
pause
