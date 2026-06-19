# 南理工课表助手 🎓

> 南京理工大学教务系统集成工具 —— Web 课表看板 + 微信小程序 + 桌面推送后端

![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)

---

## 🚀 功能一览

| 功能 | 说明 |
|------|------|
| 🖥️ **Web 课表看板** | 精美暗色/亮色主题课表，52 周日历导航，实时时钟，当前节次高亮，同天同名课程智能合并 |
| 📚 **课表查询** | 从教务系统抓取本学期完整课表，支持按周浏览 |
| 📊 **成绩查询** | 按学期查询成绩，自动统计平均分与总学分 |
| 🔔 **桌面推送** | 每日自动推送当天课表提醒，60 分钟自动刷新成绩 |
| 🔐 **教务认证** | IDS 统一认证 + AES-256-CBC 加密登录，支持桥接反爬 |
| 🌉 **浏览器桥接** | 持久化 Edge/Chromium 浏览器绕过教务反爬，自动续期会话 |
| 📱 **微信小程序** | 移动端快捷查课表、成绩（配套小程序前端） |

---

## 🖥️ Web Dashboard（亮点）

直接在浏览器打开即可使用，无需小程序：

```
http://localhost:3000
```

### 特性

- **📅 52 周全年日历导航** — 学期外周次自动留空，显示有课周范围
- **⏰ 实时时钟** — 精确到秒，随系统时间更新
- **🎯 当前节次高亮** — 只在"本周 × 今天"交集处高亮，下班不打扰
- **🔗 智能课程合并** — 同天同课程连续多节自动合并为一块，`grid-row: span N` 实现
- **🌙 暗色/☀️ 亮色主题** — 一键切换，设置持久化到 localStorage
- **📱 响应式** — 移动端适配布局

---

## 📁 项目结构

```
├── server/                         # 后端服务 (Express + SQL.js)
│   ├── src/
│   │   ├── index.js                # 入口，路由挂载
│   │   ├── dashboard.html          # 🆕 Web 课表看板（单页应用）
│   │   ├── routes/
│   │   │   ├── mini.js             # 微信小程序 API + 看板 API
│   │   │   └── pet.js              # 桌面宠物 API
│   │   ├── services/
│   │   │   ├── njust.js            # 教务系统 IDS 统一认证 + 数据抓取
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
│   ├── utils/api.js
│   └── pages/                      # 首页课表 / 周课表 / 成绩 / 考试 / 便签
│
├── docs/
│   └── cloud_integration_design.md # ☁️ 云集成设计方案
│
└── apk_extracted/                  # 已提取的 APK 资源（.gitignore）
```

---

## ⚡ 快速开始

### 环境要求

- **Node.js >= 18**（推荐 v24 LTS）
- npm
- （可选）Edge / Chromium 浏览器（用于桥接反爬）

### 安装

```bash
cd server
npm install
cp .env.example .env
```

### 配置

编辑 `.env`：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `MINI_TOKEN` | 小程序 API 密钥 | 自行设置 |
| `DESKTOP_TOKEN` | 桌面端 API 密钥 | 自行设置 |
| `ENCRYPTION_KEY` | 密码加密密钥（32 位 hex） | 自行生成 |

### 启动

```bash
# 方式 1：Node.js 直接启动
node src/index.js

# 方式 2：桥接 + 服务（推荐）
node bkjw_bridge.js   # 先开桥接（端口 3456）
node src/index.js     # 再开主服务（端口 3000）
```

启动后访问 **[http://localhost:3000](http://localhost:3000)** 即可查看课表看板。

### 微信小程序

用微信开发者工具打开 `miniprogram/` 目录，修改 `utils/api.js` 中的服务器地址即可。

---

## 🔌 API 概览

### 课表看板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | Web 课表看板（dashboard.html） |
| GET | `/api/schedule?week=N` | 获取第 N 周课表（含 maxWeek） |
| GET | `/api/scores` | 获取成绩数据 |

### 微信小程序

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/user/bind` | 绑定教务账号 |
| GET | `/api/user/status` | 查询绑定状态 |
| POST | `/api/refresh` | 手动刷新课表 + 成绩 |
| GET | `/api/scores` | 查询成绩 |
| GET | `/api/schedule` | 查询课表（默认本周） |

### 桌面宠物

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pet/poll` | 轮询推送消息 |
| POST | `/api/pet/reminder` | 添加便签提醒 |

---

## 🧱 技术栈

| 层 | 技术 |
|----|------|
| **后端框架** | Express.js 4.x |
| **数据库** | SQLite 3（通过 sql.js，无需原生编译） |
| **爬虫** | axios + cheerio + crypto-js |
| **Web 前端** | 原生 HTML/CSS/JS，CSS Variables 双主题，CSS Grid 布局 |
| **桥接反爬** | Playwright（持久化 Chromium 上下文） |
| **小程序** | 微信小程序原生框架 |
| **安全** | AES-256-CBC / GCM，Token 鉴权 |

---

## 📜 认证流程

```
用户密码 ──▶ AES-256-CBC 加密 ──▶ IDS 统一认证 ──▶ 获取 Cookie
                                                         │
                                                    ┌────┴────┐
                                                    │ 课表抓取 │
                                                    │ 成绩抓取 │
                                                    └─────────┘
```

学校使用 IDS 统一认证系统（ids.njust.edu.cn），密码随机字符串加盐后 AES-256-CBC 加密传输。桥接模式通过持久化浏览器上下文自动维持登录会话，避免频繁认证。

---

## 🛠️ 开发

### 桥接调试

```bash
node bkjw_bridge.js --debug
```

### 查看日志

```
server/logs/ 目录下按日期滚动
```

---

## ⚠️ 免责声明

本工具仅供学习交流使用，请勿用于任何商业用途。使用本工具产生的任何后果由使用者自行承担。数据仅存储在本地，不会上传至任何第三方服务器。
