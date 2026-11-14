@echo off
rem One-click start for Windows. Installs what is missing, then opens the site at http://localhost:3000
setlocal
cd /d "%~dp0"

where py >nul 2>nul || (echo Python 3.11 or newer is needed. Install it from python.org and tick "Add python.exe to PATH". & pause & exit /b 1)
where npm >nul 2>nul || (echo Node.js 20 or newer is needed. Install it from nodejs.org. & pause & exit /b 1)

if not exist backend\.venv (
  echo Setting up the backend, this takes a minute...
  py -m venv backend\.venv || (pause & exit /b 1)
  backend\.venv\Scripts\python -m pip install -q --only-binary=:all: -r backend\requirements.txt || (pause & exit /b 1)
)

if not exist backend\aiub.db (
  pushd backend
  ..\backend\.venv\Scripts\python -m app.seed --demo
  popd
  echo.
  echo Write down the admin password shown above. It is shown only once.
  pause
)

if not exist frontend\node_modules (
  echo Setting up the website, this takes a few minutes...
  pushd frontend
  call npm install --no-audit --no-fund
  popd
)
if not exist frontend\.env.local copy frontend\.env.local.example frontend\.env.local >nul

start "Campus Darpan API" cmd /k "cd /d %~dp0backend && .venv\Scripts\python -m uvicorn app.main:app --port 8000"
start "Campus Darpan Website" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 10 >nul
start http://localhost:3000
