@echo off
REM ============================================================
REM  Stud Extraction - one-click launcher (Windows)
REM  Builds the React frontend, sets up Python, starts server.
REM ============================================================
cd /d "%~dp0"

REM ---- 1. Python virtual environment + backend deps ----
if not exist ".venv\Scripts\python.exe" (
    echo [setup] Creating Python virtual environment...
    py -m venv .venv
    echo [setup] Installing backend dependencies...
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

REM ---- 2. Build the React frontend ----
echo [setup] Building React frontend...
pushd frontend
call npm install --silent
call npm run build
popd

echo.
echo ============================================================
echo   Stud Extraction is starting...
echo   Open your browser at:  http://localhost:8001
echo   (Press Ctrl+C in this window to stop)
echo ============================================================
echo.

start "" http://localhost:8001
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
pause
