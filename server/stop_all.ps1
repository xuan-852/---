# 停止所有小程序相关服务
Write-Host "🛑 正在停止所有服务..." -ForegroundColor Cyan

# 1. 查找并杀掉 node 进程（排除 VSCode 的 extension host）
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -notmatch 'vscode|extensions' -and $_.CommandLine -match 'server|bridge|ngrok|bkjw'
}

if ($nodeProcesses) {
    foreach ($p in $nodeProcesses) {
        Write-Host "  ╰ 终止 node PID $($p.ProcessId)" -ForegroundColor Yellow
        taskkill /f /pid $p.ProcessId 2>$null
    }
    Write-Host "  ✅ 已终止 $($nodeProcesses.Count) 个 node 进程" -ForegroundColor Green
} else {
    Write-Host "  ╰ 未找到相关 node 进程" -ForegroundColor DarkYellow
}

# 2. 查找 ngrok 进程
$ngrok = Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'"
if ($ngrok) {
    foreach ($p in $ngrok) {
        Write-Host "  ╰ 终止 ngrok PID $($p.ProcessId)" -ForegroundColor Yellow
        taskkill /f /pid $p.ProcessId 2>$null
    }
    Write-Host "  ✅ 已终止 ngrok" -ForegroundColor Green
}

# 3. 检查端口
$ports = @(3000, 3456, 4040)
foreach ($port in $ports) {
    $conn = netstat -ano | Select-String "LISTENING" | Select-String ":$port "
    if ($conn) {
        Write-Host "  ⚠️  端口 $port 仍有进程在监听" -ForegroundColor Red
    } else {
        Write-Host "  ✅ 端口 $port 已释放" -ForegroundColor DarkGreen
    }
}

Write-Host "`n✅ 停止完成" -ForegroundColor Cyan
