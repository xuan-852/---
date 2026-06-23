@echo off
REM ============================================================
REM BKJW 全栈开机自启脚本（VBS 调用用）
REM 由 start-all.ps1 通过 PM2 管理进程
REM 此 BAT 用于 Task Scheduler 或 VBS 调用
REM ============================================================

set SERVER_DIR=d:\C\小程序\server
set NODE_PATH=C:\Program Files\nodejs\node.exe
set PM2_PATH=C:\Users\%USERNAME%\AppData\Roaming\npm\pm2.cmd

REM 切换到服务器目录
cd /d "%SERVER_DIR%"

REM 设置环境变量
set BRIDGE_CRED_TOKEN=bridge-cred-4a7f3b2e8c11

REM 启动 PM2（如果已保存则自动恢复）
start /B "" "%PM2_PATH%" resurrect

REM 如果 PM2 没有保存的进程，手动启动
REM 等待 3 秒再检查
timeout /t 3 /nobreak >nul

"%PM2_PATH%" list | findstr "bkjw-server" >nul
if errorlevel 1 (
  echo [BKJW] PM2 无保存进程，手动启动...
  "%PM2_PATH%" start "%SERVER_DIR%\ecosystem.config.js"
  "%PM2_PATH%" save
)

echo [BKJW] 启动完成！
