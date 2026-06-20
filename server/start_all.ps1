# 一键启动小程序服务（bridge + server + ngrok）
# 用法: powershell -ExecutionPolicy Bypass .\start_all.ps1

$ErrorActionPreference = 'Continue'
$NODE = "C:\Program Files\nodejs\node.exe"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$NGROK = "C:\Users\25295\AppData\Local\ngrok\ngrok.exe"

Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    小程序服务一键启动                      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan

# 1. 停止旧服务
Write-Host "`n📋 Step 1/4: 清理旧进程..." -ForegroundColor Yellow
& "$ROOT\stop_all.ps1"
Start-Sleep 2

# 2. 启动桥接服务（背景运行）
Write-Host "`n📋 Step 2/4: 启动桥接服务 → http://localhost:3456" -ForegroundColor Yellow
$bridgeLog = "$ROOT\logs\bridge.log"
if (!(Test-Path "$ROOT\logs")) { New-Item -ItemType Directory -Path "$ROOT\logs" -Force | Out-Null }
$bridgeJob = Start-Job -Name "bridge" -ScriptBlock {
    param($NODE, $ROOT, $bridgeLog)
    Set-Location $ROOT
    & $NODE "$ROOT\bkjw_bridge.js" *>> $bridgeLog
} -ArgumentList $NODE, $ROOT, $bridgeLog
Write-Host "  ╰ PID (job): $($bridgeJob.Id)" -ForegroundColor DarkGray

# 等待 bridge 就绪（最长 30s）
Write-Host "  ╰ 等待桥接服务就绪..." -ForegroundColor DarkGray
$bridgeReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 1
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3456/status" -Headers @{"x-bridge-token"="bkjw-bridge-4edf75e83c95"} -TimeoutSec 2 -ErrorAction Stop
        $bridgeReady = $true
        Write-Host "  ✅ 桥接服务就绪" -ForegroundColor Green
        break
    } catch {
        if ($i -eq 14) { Write-Host "  ╰ 仍等待中...（浏览器启动约需 10-20s）" -ForegroundColor DarkYellow }
    }
}
if (-not $bridgeReady) {
    Write-Host "  ⚠️  桥接服务未在 30s 内就绪，请检查 Edge 窗口是否打开" -ForegroundColor Red
    Write-Host "     日志: $bridgeLog"
}

# 3. 启动主服务（背景运行）
Write-Host "`n📋 Step 3/4: 启动主服务 → http://localhost:3000" -ForegroundColor Yellow
$serverLog = "$ROOT\logs\server.log"
$serverJob = Start-Job -Name "server" -ScriptBlock {
    param($NODE, $ROOT, $serverLog)
    Set-Location $ROOT
    & $NODE "$ROOT\src\index.js" *>> $serverLog
} -ArgumentList $NODE, $ROOT, $serverLog
Write-Host "  ╰ PID (job): $($serverJob.Id)" -ForegroundColor DarkGray

Start-Sleep 3
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/ping" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  ✅ 主服务就绪" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  主服务状态未知，请检查日志" -ForegroundColor Red
    Write-Host "     日志: $serverLog"
}

# 4. 启动 ngrok（背景运行）
Write-Host "`n📋 Step 4/4: 启动 ngrok 隧道" -ForegroundColor Yellow
$ngrokLog = "$ROOT\logs\ngrok.log"
$ngrokJob = Start-Job -Name "ngrok" -ScriptBlock {
    param($NGROK, $ngrokLog)
    & $NGROK http 3000 --domain cross-churn-distance.ngrok-free.dev *>> $ngrokLog
} -ArgumentList $NGROK, $ngrokLog
Write-Host "  ╰ 隧道域名: https://cross-churn-distance.ngrok-free.dev" -ForegroundColor DarkGray
Start-Sleep 3
Write-Host "  ✅ ngrok 已启动" -ForegroundColor Green

# 汇总
Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🟢 桥接服务: http://localhost:3456" -ForegroundColor Green
Write-Host "  🟢 主服务:   http://localhost:3000" -ForegroundColor Green
Write-Host "  🟢 ngrok:    https://cross-churn-distance.ngrok-free.dev" -ForegroundColor Green
Write-Host "  📝 日志目录: $ROOT\logs\" -ForegroundColor DarkGray
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n⚠️  如果桥接提示未登录，请在打开的 Edge 中完成 eHall SSO 登录" -ForegroundColor Yellow
Write-Host "   然后访问 http://localhost:3000/api/refresh 刷新数据" -ForegroundColor DarkGray
Write-Host "`n停止: 运行 stop_all.ps1" -ForegroundColor DarkGray
