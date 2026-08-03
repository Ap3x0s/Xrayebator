@echo off
REM Запуск Xrayebator GUI с диагностикой (без tray)
chcp 65001 >nul
cd /d "%~dp0"
echo === Starting Xrayebator GUI ===
echo Working dir: %CD%
echo Python:
.\gui\.venv\Scripts\python.exe --version
echo.
echo === Running app WITHOUT tray (debug) ===
set XRAYEBATOR_NO_TRAY=1
.\gui\.venv\Scripts\python.exe -X faulthandler -u -m gui.xrayebator_gui.app
echo === App exited, code: %ERRORLEVEL% ===
pause