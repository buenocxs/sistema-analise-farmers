@echo off
chcp 65001 >nul 2>&1
title MAVE - Iniciando sistema

echo ============================================
echo   MAVE Monitoring System - Startup
echo ============================================
echo.

set "RAIZ=%~dp0"
set "EVOLUTION_DIR=%RAIZ%evolution-api"
set "FRONTEND_DIR=%RAIZ%mave-monitoring\frontend"

:: ==========================================
:: PASSO 1: Limpar portas
:: ==========================================
echo.
echo [1/3] Limpando processos nas portas 8080, 3000...

for %%p in (8080 3000) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%p "') do (
        echo       Porta %%p - matando PID %%a
        taskkill /F /PID %%a >nul 2>&1
    )
)
:: Esperar portas liberarem
timeout /t 3 /nobreak >nul

:: ==========================================
:: PASSO 2: Iniciar Evolution API
:: ==========================================
echo.
echo [2/3] Iniciando Evolution API (porta 8080)...

if not exist "%EVOLUTION_DIR%\package.json" (
    echo       ERRO: Evolution API nao encontrada em %EVOLUTION_DIR%
    pause
    exit /b 1
)

start "MAVE - Evolution API" /MIN cmd /k "cd /d "%EVOLUTION_DIR%" && title MAVE - Evolution API [porta 8080] && npm run start:prod"

:: Aguardar Evolution API ficar pronta
echo       Aguardando Evolution API...
set /a "tentativas=0"
:loop_evolution
set /a "tentativas+=1"
if %tentativas% gtr 30 (
    echo       AVISO: Evolution API nao respondeu em 60s. Continuando mesmo assim...
    goto evolution_done
)
timeout /t 2 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost:8080 >"%TEMP%\mave_health.txt" 2>nul
set /p "status="<"%TEMP%\mave_health.txt"
if "%status%"=="200" (
    echo       Evolution API OK
    goto evolution_done
)
if "%status%"=="401" (
    echo       Evolution API OK (requer auth)
    goto evolution_done
)
echo       Tentativa %tentativas%/30...
goto loop_evolution
:evolution_done

:: ==========================================
:: PASSO 3: Iniciar Frontend Vite
:: ==========================================
echo.
echo [3/3] Iniciando Frontend (porta 3000)...

if not exist "%FRONTEND_DIR%\package.json" (
    echo       ERRO: Frontend nao encontrado em %FRONTEND_DIR%
    pause
    exit /b 1
)

start "MAVE - Frontend" /MIN cmd /k "cd /d "%FRONTEND_DIR%" && title MAVE - Frontend React [porta 3000] && npm run dev"

:: Esperar Vite subir
timeout /t 5 /nobreak >nul

:: ==========================================
:: PRONTO
:: ==========================================
echo.
echo ============================================
echo   MAVE Monitoring System - ONLINE
echo ============================================
echo.
echo   Frontend:      http://localhost:3000
echo   Evolution API: http://localhost:8080
echo.
echo   Janelas abertas (minimizadas):
echo     - MAVE - Evolution API
echo     - MAVE - Frontend React
echo.
echo   Para parar tudo: execute stop-mave.bat
echo ============================================
echo.

:: Abrir navegador
start http://localhost:3000

pause
