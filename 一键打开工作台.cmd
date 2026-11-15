@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\start-workbench.ps1"
if errorlevel 1 (
  echo 启动未完成，请查看上方中文提示及项目 logs 目录。
  pause
  exit /b 1
)
endlocal
