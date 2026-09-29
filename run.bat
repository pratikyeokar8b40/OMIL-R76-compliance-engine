@echo off
setlocal

title NAWI Development Environment

REM ============================================================
REM NAWI - One Click Development Launcher
REM ============================================================

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo.
echo ============================================================
echo              NAWI DEVELOPMENT ENVIRONMENT
echo ============================================================
echo.
echo Backend  : http://localhost:8000
echo Frontend : http://localhost:5174
echo.

REM ============================================================
REM CHECK BACKEND
REM ============================================================

if not exist "%BACKEND%" (
    echo [ERROR] Backend folder not found:
    echo %BACKEND%
    echo.
    pause
    exit /b 1
)

echo [OK] Backend folder found.

REM ============================================================
REM CHECK FRONTEND
REM ============================================================

if not exist "%FRONTEND%" (
    echo [ERROR] frontend folder not found:
    echo %FRONTEND%
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND%\package.json" (
    echo [ERROR] package.json not found in:
    echo %FRONTEND%
    echo.
    pause
    exit /b 1
)

echo [OK] frontend found.

REM ============================================================
REM FRONTEND DEPENDENCIES
REM ============================================================

if not exist "%FRONTEND%\node_modules" (

    echo.
    echo [INFO] Frontend dependencies not found.
    echo [INFO] Installing npm dependencies...
    echo.

    pushd "%FRONTEND%"

    call npm.cmd install

    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo.
        popd
        pause
        exit /b 1
    )

    popd

    echo.
    echo [OK] Frontend dependencies installed.
)

REM ============================================================
REM PORT GUARDS - a previous run.bat (or a crashed one) may have
REM left servers on 8000/5174. Starting a second instance then
REM fails silently and the browser opens a dead port (white
REM screen). Detect and reuse healthy instances, fail loudly
REM on unhealthy squatters.
REM ============================================================

set "BACKEND_RUNNING="
set "FRONTEND_RUNNING="

netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3);exit 0}catch{exit 1}" >nul 2>&1
    if not errorlevel 1 (
        set "BACKEND_RUNNING=1"
        echo [OK] Backend already running on port 8000 - reusing it.
    ) else (
        echo [ERROR] Port 8000 is occupied by another program that is not a healthy NAWI backend.
        echo         Close it and run this script again.
        echo.
        pause
        exit /b 1
    )
)

netstat -ano | findstr /R /C:":5174 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5174/' -TimeoutSec 3);exit 0}catch{exit 1}" >nul 2>&1
    if not errorlevel 1 (
        set "FRONTEND_RUNNING=1"
        echo [OK] Frontend already running on port 5174 - reusing it.
    ) else (
        echo [ERROR] Port 5174 is occupied by another program that is not a healthy NAWI frontend.
        echo         Close it and run this script again.
        echo.
        pause
        exit /b 1
    )
)

REM ============================================================
REM START BACKEND
REM ============================================================

if not defined BACKEND_RUNNING (
    echo.
    echo [INFO] Starting NAWI Backend...

    start "NAWI Backend" cmd /k "cd /d ""%BACKEND%"" && python -m uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000"
)

REM ============================================================
REM START FRONTEND
REM ============================================================

if not defined FRONTEND_RUNNING (
    echo [INFO] Starting NAWI Frontend...

    start "NAWI Frontend" cmd /k "cd /d ""%FRONTEND%"" && call npm.cmd run dev"
)

REM ============================================================
REM WAIT UNTIL BOTH SERVERS ACTUALLY ANSWER - never open the
REM browser against a server that is still booting or dead.
REM ============================================================

echo.
echo [INFO] Waiting for the backend to answer...

powershell -NoProfile -Command "foreach($i in 1..120){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{};Start-Sleep -Milliseconds 500};exit 1" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] The backend did not answer on http://localhost:8000/health within 60 seconds.
    echo         Check the "NAWI Backend" window for the actual error, then run this script again.
    echo.
    pause
    exit /b 1
)
echo [OK] Backend is up.

echo [INFO] Waiting for the frontend to answer...

powershell -NoProfile -Command "foreach($i in 1..120){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5174/' -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{};Start-Sleep -Milliseconds 500};exit 1" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] The frontend did not answer on http://localhost:5174/ within 60 seconds.
    echo         Check the "NAWI Frontend" window for the actual error, then run this script again.
    echo.
    pause
    exit /b 1
)
echo [OK] Frontend is up.

REM ============================================================
REM OPEN FRONTEND IN DEFAULT BROWSER
REM ============================================================

echo [INFO] Opening NAWI Frontend...
echo.

start "" "http://localhost:5174/"

REM ============================================================
REM DONE
REM ============================================================

echo ============================================================
echo              NAWI STARTUP COMPLETE
echo ============================================================
echo.
echo Backend  : http://localhost:8000
echo Frontend : http://localhost:5174
echo.
echo The frontend has been opened in your default browser.
echo.
echo Backend and Frontend terminals are running separately.
echo ============================================================
echo.

exit /b 0