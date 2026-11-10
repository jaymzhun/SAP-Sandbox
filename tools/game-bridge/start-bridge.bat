@echo off
rem Starts the game bridge for the sandbox's "Test Battle" button. Keep this window open while you use it.
cd /d "%~dp0"
python -c "import frida" 2>nul || (
  echo Installing Frida for the bridge...
  python -m pip install --user frida || (echo Could not install Frida. & pause & exit /b 1)
)
python bridge.py %*
pause
