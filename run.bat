@echo off
setlocal EnableExtensions

title NAWI Development Environment

REM ============================================================
REM NAWI - One Click Development Launcher
REM   Backend  : http://127.0.0.1:8000  (FastAPI, SQLite dev DB)
REM   Frontend : http://localhost:5174  (Vite dev server, proxies /api)
REM ============================================================

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%NAWI Frontend 7"
set "PY=%BACKEND%\.venv\Scripts\python.exe"

echo.
echo ============================================================
echo              NAWI DEVELOPMENT ENVIRONMENT
echo ============================================================
echo.

if not exist "%BACKEND%\requirements.txt" (
    echo [ERROR] Backend folder not found: %BACKEND%
    pause
    exit /b 1
)
if not exist "%FRONTEND%\package.json" (
    echo [ERROR] Frontend folder not found: %FRONTEND%
    pause
    exit /b 1
)
if not exist "%FRONTEND%\src\lib\requirements.js" (
    echo [ERROR] "%FRONTEND%\src\lib" is missing - pull the latest code.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM Ports must be free: another app on 8000 would receive NAWI's
REM API calls (e.g. a Docker container from another project).
REM ------------------------------------------------------------
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul
if not errorlevel 1 (
    echo [ERROR] Port 8000 is already in use by another program.
    echo         If it is a Docker container, stop it first, e.g.:
    echo           docker ps
    echo           docker stop ^<container-name^>
    echo         Then run this script again.
    pause
    exit /b 1
)
netstat -ano | findstr /R /C:":5174 .*LISTENING" >nul
if not errorlevel 1 (
    echo [ERROR] Port 5174 is already in use. Close the other dev server first.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM Backend: virtual environment + dependencies (first run only)
REM ------------------------------------------------------------
if not exist "%PY%" (
    echo [INFO] Creating Python virtual environment...
    pushd "%BACKEND%"
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Could not create the virtual environment. Is Python 3.11+ installed?
        popd
        pause
        exit /b 1
    )
    "%PY%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] pip install failed.
        popd
        pause
        exit /b 1
    )
    popd
)

REM ------------------------------------------------------------
REM Frontend dependencies (first run only)
REM ------------------------------------------------------------
if not exist "%FRONTEND%\node_modules" (
    echo [INFO] Installing frontend dependencies...
    pushd "%FRONTEND%"
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        popd
        pause
        exit /b 1
    )
    popd
)

REM ------------------------------------------------------------
REM QR codes on reports must open on a phone: use this laptop's
REM LAN address (same Wi-Fi) instead of "localhost".
REM ------------------------------------------------------------
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if ($c) { $c.IPv4Address[0].IPAddress }"`) do set "LANIP=%%i"
if defined LANIP (
    set "REPORT_VERIFY_BASE_URL=http://%LANIP%:5174/verify"
) else (
    set "REPORT_VERIFY_BASE_URL=http://localhost:5174/verify"
)

REM ------------------------------------------------------------
REM Demo data (idempotent): 3 users, 3 instruments, one signed
REM report with a FAIL row, one in-progress session to resume.
REM ------------------------------------------------------------
echo [INFO] Preparing demo data...
pushd "%BACKEND%"
"%PY%" -m scripts.seed_finale
if errorlevel 1 (
    echo [ERROR] Seeding the demo data failed - see the message above.
    popd
    pause
    exit /b 1
)
popd

REM ------------------------------------------------------------
REM Start backend and frontend in their own windows
REM ------------------------------------------------------------
echo [INFO] Starting NAWI backend...
start "NAWI Backend" cmd /k "cd /d ""%BACKEND%"" && "".venv\Scripts\python.exe"" -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000"

echo [INFO] Starting NAWI frontend...
start "NAWI Frontend" cmd /k "cd /d ""%FRONTEND%"" && call npm.cmd run dev"

echo [INFO] Waiting for the servers to start...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5174/"

echo.
echo ============================================================
echo              NAWI STARTUP COMPLETE
echo ============================================================
echo  App (this laptop) : http://localhost:5174
if defined LANIP echo  App (phone/Wi-Fi) : http://%LANIP%:5174   (allow Node.js through Windows Firewall)
echo  QR codes open     : %REPORT_VERIFY_BASE_URL%/...
echo  API docs          : http://127.0.0.1:8000/docs
echo.
echo  Sign in: tech@lab.gov.in / officer@lab.gov.in / admin@lab.gov.in
echo  Password: demo-password-2026
echo ============================================================
echo.
exit /b 0
