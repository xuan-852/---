' BKJW 桥接服务 — 静默启动脚本
' 运行 bkjw_bridge.js 在后台（不显示控制台窗口）
' Edge 浏览器会自动最小化启动

Dim objShell, scriptDir, nodePath
Set objShell = CreateObject("WScript.Shell")

' 获取脚本所在目录（server/）
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Node.js 路径
nodePath = "node"

' 启动桥接服务（隐藏控制台窗口，从 server 目录启动）
objShell.Run "cmd /c cd /d """ & scriptDir & """ && " & nodePath & " bkjw_bridge.js", 0, False

' 等待 3 秒再启动主后端服务
WScript.Sleep 3000

' 启动主服务（从 server 目录启动，确保 dotenv 能加载 .env）
objShell.Run "cmd /c cd /d """ & scriptDir & """ && " & nodePath & " src/index.js", 0, False
