# 🎓 南理工课表助手

> 课表查询 + 成绩推送 + 符玄桌面宠物联动

| 模块 | 位置 | 技术 |
|------|------|------|
| 云服务器 | `server/` | Node.js + Express + SQLite |
| 微信小程序 | `miniprogram/` | 微信原生小程序 |
| 桌面端接入 | 见 Unity 项目 `CloudBridge.cs` | Unity C# |
| 文档 | `docs/` | 设计方案 |

## 项目结构

```
小程序/
├── server/              ← 云服务器后端
│   ├── package.json
│   ├── src/
│   │   ├── index.js         # 入口
│   │   ├── db/
│   │   │   ├── schema.sql   # 建表
│   │   │   └── database.js  # SQLite 连接
│   │   ├── routes/
│   │   │   ├── pet.js       # 桌面端 API
│   │   │   └── mini.js      # 小程序 API
│   │   └── services/
│   │       ├── scheduler.js # 定时抓取
│   │       └── njust.js     # 南理工教务爬虫
│   └── .env.example
├── miniprogram/          ← 微信小程序
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── index/       # 首页（今日课表）
│   │   ├── schedule/    # 周课表
│   │   ├── scores/      # 成绩
│   │   ├── exams/       # 考试安排
│   │   └── reminders/   # 桌面便签
│   └── utils/           # 工具函数
├── docs/
│   └── cloud_integration_design.md  # 完整设计方案
└── README.md
```

## 快速开始

### 后端

```bash
cd server
npm install
cp .env.example .env   # 编辑配置
npm start              # 启动 http://localhost:3000
```

### 小程序

用微信开发者工具打开 `miniprogram/` 目录即可。
