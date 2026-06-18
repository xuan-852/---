# 南理工课表助手 🎓

南京理工大学教务系统微信小程序 + 桌面端推送后端。

## 功能

- **📚 课表查询** — 从教务系统抓取本学期课表
- **📊 成绩查询** — 按学期查询成绩，自动计算 GPA（5.0 制）
- **🔔 消息推送** — 桌面端轮询获取课表提醒、成绩更新通知
- **⏰ 定时任务** — 每日自动检查当天课表并推送
- **🔐 教务认证** — 模拟 CAS 登录流程，密码 AES-256-GCM 加密存储

## 项目结构

```
├── server/                     # 后端服务 (Express + SQLite)
│   ├── src/
│   │   ├── index.js            # 入口，路由挂载
│   │   ├── routes/
│   │   │   ├── mini.js         # 微信小程序 API
│   │   │   └── pet.js          # 桌面宠物 API
│   │   ├── services/
│   │   │   ├── njust.js        # 教务系统 CAS 认证 + 数据抓取
│   │   │   └── scheduler.js    # 定时任务
│   │   └── db/
│   │       ├── database.js     # SQLite 数据库初始化
│   │       └── schema.sql      # 数据库表结构
│   ├── .env.example            # 环境变量模板
│   └── package.json
│
└── miniprogram/                # 微信小程序前端
    ├── app.js / app.json / app.wxss
    ├── utils/
    │   └── api.js              # 网络请求封装
    └── pages/
        ├── index/              # 首页（今日课表）
        ├── schedule/           # 周课表
        ├── scores/             # 成绩
        ├── exams/              # 考试安排
        └── reminders/          # 桌面便签
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装与配置

```bash
cd server
npm install
cp .env.example .env   # 编辑配置
```

| 环境变量 | 说明 |
|----------|------|
| `PORT` | 服务端口（默认 3000） |
| `MINI_TOKEN` | 微信小程序调用密钥 |
| `DESKTOP_TOKEN` | 桌面端调用密钥 |
| `ENCRYPTION_KEY` | 密码加密密钥 |

### 启动

```bash
npm start         # 生产环境
npm run dev       # 开发模式（热重载）
```

### 微信小程序

用微信开发者工具打开 `miniprogram/` 目录即可。

## API 概览

### 微信小程序

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/user/bind` | 绑定教务账号 |
| GET | `/api/user/status` | 查询绑定状态 |
| POST | `/api/refresh` | 手动刷新课表 + 成绩 |
| GET | `/api/scores` | 查询成绩 |
| GET | `/api/schedule` | 查询课表 |

### 桌面宠物

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pet/poll` | 轮询推送消息 |
| POST | `/api/pet/reminder` | 添加便签提醒 |

## 技术栈

- **后端**: Express.js, SQLite (sql.js), axios, cheerio
- **前端**: 微信小程序原生框架
- **认证**: CAS 协议 + AES-256-CBC 加密（兼容学校新认证系统）
- **安全**: AES-256-GCM 加密存储密码，Token 鉴权
