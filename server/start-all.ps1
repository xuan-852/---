# ============================================================
# BKJW 全栈启动脚本
# 同时启动主服务器 + Bridge（持久化浏览器）
# 可用于开机自启、手动启动、崩溃后重启
# ============================================================
param(
  [switch]$NoBridge,     # 仅启动主服务器，不启动 Bridge
  [switch]$BridgeOnly    # 仅启动 Bridge，不启动主服务器
)

$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ServerDir "logs"

# 创建日志目录
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force }

$Env:BRIDGE_CRED_TOKEN = "bridge-cred-4a7f3b2e8c11"

function Write-Log {
  param($Msg)
  $Time = Get-Date -Format "HH:mm:ss"
  Write-Host "[$Time] $Msg"
}

# ===== 检查端口是否被占用 =====
function Test-PortFree {
  param($Port)
  $conn = netstat -ano | Select-String ":$Port "
  return -not $conn
}

# ===== 等待端口可访问 =====
function Wait-ForPort {
  param($Port, $TimeoutSec = 30, $Label = "service")
  $start = Get-Date
  while ((Get-Date) - $start -lt [TimeSpan]::FromSeconds($TimeoutSec)) {
    try {
      $req = [System.Net.HttpWebRequest]::Create("http://localhost:$Port/health")
      $req.Timeout = 2000
      $resp = $req.GetResponse()
      $resp.Close()
      Write-Log "✅ $Label 已就绪 (端口 $Port)"
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  Write-Log "⚠️ $Label 未在 ${TimeoutSec}s 内就绪"
  return $false
}

# ===== 清理残留进程 =====
function Cleanup-Process {
  param($Name)
  $proc = Get-Process -Name $Name -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Log "🧹 发现残留 $Name 进程 (PID: $($proc.Id))，清理..."
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
}

# ===== 启动主服务器 =====
function Start-MainServer {
  # 先清理端口 3000
  $conn = netstat -ano | Select-String ":3000 "
  if ($conn) {
    $pid = $conn.Line.Trim().Split(' ')[-1]
    Write-Log "🧹 端口 3000 被进程 $pid 占用，清理..."
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  $logFile = Join-Path $LogDir "server.log"
  Write-Log "🚀 启动主服务器 → 日志: $logFile"
  $ps = Start-Process -FilePath "node" -ArgumentList "src/index.js" `
    -WorkingDirectory $ServerDir `
    -RedirectStandardOutput $logFile -RedirectStandardError "${logFile}.err" `
    -NoNewWindow -PassThru
  
  Write-Log "   PID: $($ps.Id)"
  Start-Sleep -Seconds 2
  
  # 检查是否存活
  if ($ps.HasExited) {
    Write-Log "❌ 主服务器启动失败！日志:"
    Get-Content $logFile -Tail 5
    return $false
  }
  return $true
}

# ===== 启动 Bridge =====
function Start-Bridge {
  # 先清理端口 3456
  $conn = netstat -ano | Select-String ":3456 "
  if ($conn) {
    $pid = $conn.Line.Trim().Split(' ')[-1]
    Write-Log "🧹 端口 3456 被进程 $pid 占用，清理..."
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }

  # 清理残留的 Edge 用户数据（如果浏览器崩溃后锁死）
  $profileDir = Join-Path $ServerDir "..\.bkjw-profile"
  $lockFile = Join-Path $profileDir "SingletonLock"
  if (Test-Path $lockFile) {
    Write-Log "🧹 清理浏览器锁文件..."
    Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $profileDir "SingletonSocket") -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $profileDir "SingletonCookie") -Force -ErrorAction SilentlyContinue
  }

  $logFile = Join-Path $LogDir "bridge.log"
  Write-Log "🚀 启动 Bridge（持久化浏览器）→ 日志: $logFile"
  $ps = Start-Process -FilePath "node" -ArgumentList "bkjw_bridge.js" `
    -WorkingDirectory $ServerDir `
    -RedirectStandardOutput $logFile -RedirectStandardError "${logFile}.err" `
    -NoNewWindow -PassThru
  
  Write-Log "   PID: $($ps.Id)"
  Start-Sleep -Seconds 5

  if ($ps.HasExited) {
    Write-Log "❌ Bridge 启动失败！日志:"
    Get-Content $logFile -Tail 10
    return $false
  }
  return $true
}

# ===== 主入口 =====
Write-Log "========================================"
Write-Log "  BKJW 全栈启动脚本"
Write-Log "========================================"

if ($BridgeOnly) {
  Start-Bridge
  exit
}

if ($NoBridge) {
  Start-MainServer
  exit
}

# 默认：先启动主服务器，再启动 Bridge
$serverOk = Start-MainServer
if ($serverOk) {
  # 等主服务器完全就绪
  Start-Sleep -Seconds 3
  Write-Log "🔌 启动 Bridge..."
  Start-Bridge
}

Write-Log "========================================"
Write-Log "  启动完成！"
Write-Log "  API:       http://localhost:3000"
Write-Log "  Bridge:    http://localhost:3456"
Write-Log "  日志目录:  $LogDir"
Write-Log "========================================"
