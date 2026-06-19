# 南理工课表助手 🎓

> 南京理工大学教务系统集成工具 —— Web 课表看板 + 微信小程序 + 桌面推送后端

**当前版本：v0.1** — 本地运行原型版，可用但不稳定，需手动维护。

![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![Status](https://img.shields.io/badge/Status-Prototype-yellow)

---

## 📋 目录

- [功能一览](#-功能一览)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [API 概览](#-api-概览)
- [技术栈](#-技术栈)
- [认证流程](#-认证流程)
- [已知问题（v0.1）](#-已知问题v01)
- [待办清单（Roadmap）](#-待办清单roadmap)
- [架构痛点与重构方向](#-架构痛点与重构方向)
- [开发指南](#-开发指南)

---

## 🚀 功能一览

| 功能 | 说明 | 状态 |
|------|------|------|
| 🖥️ **Web 课表看板** | 暗色/亮色主题，52 周日历，实时时钟，节次高亮，课程合并 | ✅ 完成 |
| 📚 **课表查询** | 从教务系统抓取本学期课表，按周浏览 | ✅ 完成 |
| 📊 **成绩查询** | 按学期分组，自动统计 GPA 与总学分 | ✅ 完成 |
| 📝 **考试安排** | 考试时间、地点、座位号查询 | ✅ 完成 |
| 🔐 **IDS 认证** | AES-256-CBC 加密登录，验证码支持 | ✅ 完成 |
| 🌉 **浏览器桥接** | 持久化 Edge 绕过反爬，自动续期 | ⚠️ 需手动登录 |
| 📱 **微信小程序** | 移动端查课表、成绩、考试 | ⚠️ 连接不稳定 |
| 🔔 **桌面推送** | 每日课表提醒 + 自动刷新成绩 | 🚧 部分完成 |
| 📌 **桌面便签** | 跨设备便签同步 | 🚧 未完工 |
| ☁️ **云部署** | 摆脱本地依赖 | ❌ 未开始 |

---

## 📁 项目结构

```
├── server/                         # 后端服务 (Express + SQL.js)
│   ├── src/
│   │   ├── index.js                # 入口，路由挂载
│   │   ├── dashboard.html          # Web 课表看板（单页应用）
│   │   ├── routes/
│   │   │   ├── mini.js             # 微信小程序 API + 看板 API
│   │   │   └── pet.js              # 桌面宠物 API
│   │   ├── services/
│   │   │   ├── njust.js            # IDS 统一认证 + 数据抓取
│   │   │   └── scheduler.js        # 定时任务调度
│   │   └── db/
│   │       ├── database.js         # SQL.js 数据库封装
│   │       └── schema.sql          # 表结构定义
│   ├── data/                       # SQLite 数据库文件（.gitignore）
│   │   └── njust.db
│   ├── bkjw_bridge.js              # Edge 浏览器桥接（端口 3456）
│   ├── start_bridge.vbs            # 静默自启 VBS 脚本
│   ├── setup_bridge.ps1            # 安装/卸载菜单
│   ├── .env.example                # 环境变量模板
│   └── package.json
│
├── miniprogram/                    # 微信小程序前端
│   ├── app.js / app.json / app.wxss
│   ├── utils/
│   │   ├── api.js                  # 网络请求 + 缓存层 + 心跳
│   │   ├── constants.js            # 学期配置 & 周次计算
│   │   └── banner.wxml             # 公用连接状态横幅
│   └── pages/                      # 今天 / 课表 / 成绩 / 考试 / 便签 / 设置
│
├── docs/
│   └── cloud_integration_design.md # 云集成设计方案
│
└── apk_extracted/                  # 已提取的 APK 资源（.gitignore）
```

---

## ⚡ 快速开始

### 环境要求

- **Node.js >= 18**（当前环境 v24.16.0 LTS，路径 `C:\Program Files\nodejs`）
- npm（通常随 Node 自带）
- **Edge 浏览器**（用于桥接反爬，需提前安装）

> ⚠️ v24.16.0 不在系统 PATH 中，需用完整路径调用，或手动加入 PATH。
> PowerShell 调用示例：`& "C:\Program Files\nodejs\node.exe" src/index.js`

### 安装

```bash
cd server
npm install
npx playwright install msedge   # 安装 Playwright Edge 支持
```

### 配置

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env`（参考下表）：

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `PORT` | 服务端口 | `3000` | 否 |
| `MINI_TOKEN` | 小程序 API 密钥 | — | 是 |
| `DESKTOP_TOKEN` | 桌面端 API 密钥 | — | 是 |
| `ENCRYPTION_KEY` | 密码加密密钥（≥32 字符） | — | 是 |
| `BRIDGE_URL` | 桥接服务地址 | `http://localhost:3456` | 否 |
| `BRIDGE_TOKEN` | 桥接服务 Token | — | 是（由 bridge 自动生成） |

> **获取 BRIDGE_TOKEN**：先启动 `bkjw_bridge.js`，控制台会打印 Token，复制到 `.env` 中。

### 启动（三个终端窗口）

```powershell
# 终端 1：桥接服务（持久化浏览器）
cd server
& "C:\Program Files\nodejs\node.exe" bkjw_bridge.js

# 终端 2：主服务
cd server\src
& "C:\Program Files\nodejs\node.exe" index.js

# 终端 3：ngrok 内网穿透（小程序真机调试用）
ngrok http 3000
```

启动后访问 http://localhost:3000 即可查看课表看板。

### ⚠️ 桥接服务首次使用

1. 启动 `bkjw_bridge.js` → Edge 浏览器自动打开（最小化到任务栏）
2. 手动将 Edge 窗口恢复，导航到 http://ehall.njust.edu.cn
3. 完成统一认证登录
4. 登录成功后关闭 Edge 窗口（进程保留，下次自动恢复会话）
5. 控制台显示 `isLoggedIn: true` 即就绪

### 微信小程序

用微信开发者工具打开 `miniprogram/` 目录，**在详情中勾选"不校验合法域名"**（urlCheck: false）。

开发者工具会自动连 `http://localhost:3000`，真机调试自动走 ngrok 域名。

---

## 🔌 API 概览

### 课表看板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | Web 课表看板（dashboard.html） |
| GET | `/api/schedule?week=N` | 获取第 N 周课表（含 maxWeek） |
| GET | `/api/scores` | 获取成绩数据 |
| GET | `/api/ping` | 健康检查 |

### 微信小程序

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ping` | 健康检查（心跳用） |
| POST | `/api/user/bind` | 绑定教务账号（学号+密码） |
| GET | `/api/user/status` | 查询绑定状态 |
| POST | `/api/refresh` | 手动刷新课表+成绩+考试（超时 120s） |
| GET | `/api/scores` | 查询成绩 |
| GET | `/api/schedule?week=N` | 查询第 N 周课表 |
| GET | `/api/exams` | 查询考试安排 |

### 桌面端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pet/poll` | 轮询推送消息 |
| POST | `/api/pet/reminder` | 添加便签提醒 |
| POST | `/api/push` | 手动推送测试消息 |

---

## 🧱 技术栈

| 层 | 技术 |
|----|------|
| **后端框架** | Express.js 4.x |
| **数据库** | SQLite 3（通过 sql.js，无需原生编译） |
| **爬虫** | axios + cheerio + crypto-js |
| **Web 前端** | 原生 HTML/CSS/JS，CSS Variables 双主题，CSS Grid |
| **桥接反爬** | Playwright（持久化 Edge 上下文） |
| **内网穿透** | ngrok 3.x（cross-churn-distance.ngrok-free.dev） |
| **小程序** | 微信小程序原生框架（appid: wx90a063c9201431f3） |
| **安全** | AES-256-CBC / GCM，Token 鉴权，x-bridge-token |

---

## 📜 认证流程

```
用户密码 ──▶ AES-256-CBC 加密 ──▶ IDS 统一认证 ──▶ 获取 Cookie
                         (randomString(64)+密码)          │
                                                     ┌───┴───┐
                                                     │ 课表    │
                                                     │ 成绩    │
                                                     │ 考试    │
                                                     └───┬───┘
                                                     ┌───┴───┐
                                             桥接模式│ Edge 持久浏览器
                                                    │ 绕过反爬
                                                    └───────┘
```

学校使用 **IDS 统一认证系统**（ids.njust.edu.cn），密码经随机字符串加盐后 AES-256-CBC 加密传输。
⚠️ jwxt.njust.edu.cn 全段 404（学校服务器反向代理问题，截至 2026 年 6 月），因此采用 **浏览器桥接模式**：
通过 Playwright 启动持久化 Edge 浏览器，访问 **bkjw.njust.edu.cn** 老版教务系统来获取数据。

---

## 🐛 已知问题（v0.1）

> 以下问题当前版本已知未解决，欢迎参与修复。

### 🔴 严重

| # | 问题 | 描述 | 影响范围 | 可能方案 |
|---|------|------|----------|----------|
| 1 | **服务器不稳定，经常意外退出** | 终端中大量 `exit code 1`，Node 进程无守护机制，崩溃后需要手动重启 | 全部服务 | 添加 PM2 / systemd 进程守护，或编写 Windows 自启+保活脚本 |
| 2 | **微信小程序连接不稳定** | 小程序间歇性"未连上服务器"——即使心跳机制已防抖，桥接或主服务任一挂掉就断连 | 小程序用户 | 需先解决 #1；小程序端增加重试+等待机制 |
| 3 | **桥接服务需要手动登录** | Edge 浏览器首次启动后，需用户手动打开 eHall 完成认证，重启后偶尔会掉登录 | 数据刷新 | 实现自动检测登录态 + 自动重新认证；或改用无头 Requests 直连 |

### 🟡 中等

| # | 问题 | 描述 | 可能方案 |
|---|------|------|----------|
| 4 | **Node.js 不在系统 PATH** | v24.16.0 安装在 `C:\Program Files\nodejs`，但未加入 PATH，需用完整路径调用 | 用 `winget` 重装或手动加入 PATH |
| 5 | **无统一启动脚本** | 需要手动开 3 个 PowerShell 窗口（bridge + server + ngrok） | 编写 `start.ps1` 一键启动所有服务 |
| 6 | **日志系统不完善** | `server/logs/` 目录为空，scheduler 和 bridge 的日志仅在控制台输出 | 添加 winston / pino 日志，文件轮转 |
| 7 | **ngrok URL 硬编码** | 小程序默认服务器地址是硬编码的 ngrok 域名，更换 ngrok 账号后需要改代码 | 改用环境变量或小程序云函数中转 |
| 8 | **加密示例密钥** | `.env` 和 `.env.example` 中的加密密钥是占位符，实际应用需更换 | 添加密钥生成脚本 |
| 9 | **考试安排抓取不稳定** | `fetchExams()` 依赖页面 DOM 结构和定时等待，网络慢时可能超时或报错 | 增加重试 + 更健壮的等待策略（waitForSelector） |

### 🟢 低优先级

| # | 问题 | 描述 |
|---|------|------|
| 10 | **课表 teacher/location 字段为空** | `saveScheduleToDB` 中 teacher 和 location 写死了空字符串，未从桥接数据中提取 |
| 11 | **桌面便签功能未完工** | `reminders` 页面存在，但后端 `pet.js` 和前端 ui 均不完整 |
| 12 | **暗色/亮色主题切换仅在 Web 端** | 小程序未实现主题切换，统一为暗色 |
| 13 | **GPA 计算逻辑简单** | `_renderScores` 的 GPA 统计未考虑学分权重和非数字成绩 |

---

## 📋 待办清单（Roadmap）

### v0.2 — 稳定运行（下一版本）

- [ ] **进程守护** — 添加 PM2 配置或 Windows 自启 VBS，崩溃自动重启
- [ ] **一键启动脚本** — `start.ps1` 同时启动 bridge + server + ngrok
- [ ] **日志系统** — 添加 winston，按日期滚动 + 控制台输出
- [ ] **ngrok URL 配置化** — 从 `.env` 读取，小程序端通过 `/api/config` 获取

### v0.3 — 体验优化

- [ ] **小程序 UI 打磨** — 骨架屏加载、下拉刷新、更好的错误提示
- [ ] **课表教师/地点显示** — 从桥接数据中正确提取并写入 DB
- [ ] **考试提醒推送** — 考试前 1 天 / 3 天自动发送小程序订阅消息
- [ ] **多账号支持** — 允许多个学号绑定、切换

### v0.5 — 云部署

- [ ] **Docker 化** — 编写 Dockerfile + docker-compose（含 Playwright）
- [ ] **云服务器部署** — 部署到阿里云/腾讯云轻量服务器
- [ ] **HTTPS + 域名** — 配置 Nginx 反代 + SSL 证书，抛弃 ngrok
- [ ] **小程序正式上线** — 配置合法域名，提交微信审核

### v1.0 — 生产可用

- [ ] **自动登录桥接** — 通过 IDS API 自动刷新教务会话，无需手动操作
- [ ] **桌面便签完整功能** — 增删改查 + 跨设备同步
- [ ] **数据导出** — 导出为 Excel / PDF
- [ ] **GPA 趋势图** — 按学期可视化 GPA 变化
- [ ] **空教室查询** — 接入教室占用数据

---

## 🏗 架构痛点与重构方向

### 当前架构

```
User ←→ 微信小程序 ←→ ngrok ←→ [Express :3000] ←→ [Bridge :3456] ←→ Edge 浏览器 ←→ bkjw.njust.edu.cn
                                    ↕
                                SQLite (njust.db)
```

### 痛点

1. **三进程串联** — 小程序 → ngrok → Express → Bridge → Edge，任意一环断裂则全链路不可用
2. **本地依赖** — 全部跑在 Windows 个人电脑上，关机/休眠/断网即停服
3. **单用户** — 数据库设计为单用户模式（`users` 表 LIMIT 1）
4. **sql.js 内存数据库** — 写入后需手动 `save()` 到文件，进程崩溃会丢数据

### 重构方向（v1.0 目标）

```
User ←→ 微信小程序 ←→ HTTPS ←→ [Nginx] ←→ [Express :3000] (云服务器)
                                              ↕
                                           PostgreSQL
                                              ↕
                                      [定时任务] ←→ Bridge
                                              ↕
                                           Redis (队列)
```

---

## 🛠️ 开发指南

### 启动调试

```powershell
# 1. 启动桥接浏览器
cd D:\C\小程序\server
& "C:\Program Files\nodejs\node.exe" bkjw_bridge.js

# 2. 另开终端，启动主服务
cd D:\C\小程序\server\src
& "C:\Program Files\nodejs\node.exe" index.js

# 3. 启动 ngrok（小程序真机调试需要）
& "$env:LOCALAPPDATA\ngrok\ngrok.exe" http 3000
```

### 测试 API

```powershell
# 健康检查
curl http://localhost:3000/api/ping

# 查询绑定状态
curl -H "Authorization: Bearer mini_secret_token_here" http://localhost:3000/api/user/status
```

### 学期配置更新

每学期需更新 `miniprogram/utils/constants.js` 中的 `SEMESTERS` 数组：

```js
{ start: '2026-09-07', weeks: 20, label: '2026-2027-1' }, // 新增秋季学期
```

Web 看板的学期信息来自数据库（课程表最大周数），自动适配。

### 桥接调试

```bash
node bkjw_bridge.js --debug
```

### 技术债务清单

- `mini.js` 中 `saveScheduleToDB` 硬编码 `teacher=''` / `location=''`，需从桥接数据提取
- `database.js` 的 `wrapDB` 中 `lastInsertRowid` 统一返回 0，实际未实现
- 多个位置重复写 `INSERT OR REPLACE INTO scores` 逻辑，应抽取为公共函数
- 定时任务硬编码 60 分钟间隔，应配置化
- 考试安排抓取在 bridge 和 scheduler 中各有实现，应统一

---

## ⚠️ 免责声明

本工具仅供学习交流使用，请勿用于任何商业用途。使用本工具产生的任何后果由使用者自行承担。数据仅存储在本地，不会上传至任何第三方服务器。
