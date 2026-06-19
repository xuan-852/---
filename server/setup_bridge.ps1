# BKJW 桥接服务 — 开机自启安装/卸载脚本
# 以管理员身份运行 PowerShell，执行:
#   powershell -ExecutionPolicy Bypass -File setup_bridge.ps1

param(
  [switch]$Uninstall,
  [switch]$SkipEdgeInstall
)

$ErrorActionPreference = 'Stop'
$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VbsPath = Join-Path $ServerDir "start_bridge.vbs"
$StartupDir = [Environment]::GetFolderPath('Startup')
$LinkPath = Join-Path $StartupDir "BkjwBridge.url"

function Write-Info  { Write-Host "ℹ️  $args" -ForegroundColor Cyan }
function Write-OK   { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Err  { Write-Host "❌ $args" -ForegroundColor Red }
function Write-Step { Write-Host "`n▶ $args" -ForegroundColor Yellow }

if ($Uninstall) {
  Write-Step "卸载 BKJW 桥接服务开机自启"
  if (Test-Path $LinkPath) {
    Remove-Item $LinkPath -Force
    Write-OK "已移除开机自启链接"
  } else {
    Write-Info "开机自启链接不存在"
  }
  
  # 可选：清理浏览器数据
  $profileDir = Join-Path $ServerDir "..\.bkjw-profile"
  if (Test-Path $profileDir) {
    Write-Info "用户浏览器数据保留在: $profileDir"
    Write-Info "如需完全清理，请手动删除该目录"
  }
  
  Write-OK "卸载完成"
  exit
}

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║     BKJW 桥接服务 — 安装向导                ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow

# Step 1: 检查 Node.js
Write-Step "Step 1: 检查 Node.js"
try {
  $nodeVer = node --version
  Write-OK "Node.js $nodeVer"
} catch {
  Write-Err "未找到 Node.js，请先安装 https://nodejs.org"
  exit 1
}

# Step 2: 安装依赖
Write-Step "Step 2: 安装 npm 依赖"
Push-Location $ServerDir
try {
  npm install --silent 2>&1 | Out-Null
  Write-OK "npm 依赖已安装"
} catch {
  Write-Err "npm install 失败: $_"
  Pop-Location
  exit 1
}
Pop-Location

# Step 3: 安装 Playwright Edge 浏览器
if (-not $SkipEdgeInstall) {
  Write-Step "Step 3: 安装 Playwright 浏览器驱动"
  Push-Location $ServerDir
  try {
    $result = npx playwright install msedge 2>&1
    Write-OK "Playwright Edge 驱动就绪"
  } catch {
    Write-Err "Playwright 安装失败: $_"
    Write-Info "可以稍后手动运行: cd $ServerDir && npx playwright install msedge"
    Pop-Location
    exit 1
  }
  Pop-Location
} else {
  Write-Step "Step 3: 跳过 Edge 驱动安装"
}

# Step 4: 设置开机自启（通过 VBS + 启动文件夹快捷方式）
Write-Step "Step 4: 设置开机自启"
if (-not (Test-Path $VbsPath)) {
  Write-Err "未找到 start_bridge.vbs: $VbsPath"
  exit 1
}

# 创建 .url 快捷方式到 VBS（比 .lnk 更简单，不需要 COM 对象）
$urlContent = @"
[InternetShortcut]
URL=file:///$($VbsPath -replace '\\','/')
"@
Set-Content -Path $LinkPath -Value $urlContent -Encoding ASCII
Write-OK "开机自启已设置 → $LinkPath"

# 验证
if (Test-Path $LinkPath) {
  Write-OK "开机自启链接创建成功"
} else {
  Write-Err "创建失败"
  exit 1
}

# Step 5: 首次运行测试
Write-Step "Step 5: 启动桥接服务（首次运行）"
Write-Info "正在启动桥接服务..."

try {
  # 启动 VBS
  Start-Process -FilePath "wscript.exe" -ArgumentList "`"$VbsPath`"" -WindowStyle Hidden
  Write-OK "桥接服务已启动"
  Write-Info "Edge 浏览器窗口将会打开（首次运行需要手动登录）"
} catch {
  Write-Err "启动失败: $_"
}

# 完成
Write-Host "`n╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     安装完成！                             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "【首次使用指南】" -ForegroundColor Yellow
Write-Host "  1. Edge 浏览器已自动打开（最小化）"
Write-Host "  2. 把它还原出来，访问: http://ehall.njust.edu.cn"
Write-Host "  3. 完成 SSO 登录 → 点击教务系统（师生端）"
Write-Host "  4. 确认进入成绩页面后，查看桥接服务控制台:"
Write-Host "     它应该显示「已登录，自动抓取数据」"
Write-Host ""
Write-Host "  Token 信息会在桥接服务窗口打印"
Write-Host "  复制 Token 到 .env 文件的 BRIDGE_TOKEN="
Write-Host ""
Write-Host "【开关机说明】" -ForegroundColor Cyan
Write-Host "  - 开机自动启动（已设置）"
Write-Host "  - 浏览器窗口最小化到任务栏，无需操作"
Write-Host "  - 登录状态可保持数周"
Write-Host "  - 如需重新登录，直接操作窗口即可"
Write-Host ""
Write-Host "【卸载】" -ForegroundColor Red
Write-Host "  powershell -ExecutionPolicy Bypass -File setup_bridge.ps1 -Uninstall"
