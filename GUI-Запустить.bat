@echo off
cd /d "%~dp0"
echo === Xrayebator GUI ===
echo.
.\gui\.venv\Scripts\python.exe GUI-demo.py
echo === Exit: %ERRORLEVEL% ===
pause