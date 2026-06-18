# ☁️ 云集成设计方案

> 桌面宠物 ←→ 云服务器 → 微信小程序 + 学校教务
> 2026-06-19

---

## 一、整体架构

```
┌─────────────────────────┐          HTTP REST + SSE          ┌──────────────────┐
│  桌面端 (符玄)           │ ◄──────────────────────────────►  │  云服务器         │
│  Unity C#               │      (桌面端主动轮询 + 长连接)     │  Node.js/Express  │
│  ┌───────────────────┐  │                                   │  + SQLite         │
│  │ CloudBridge.cs     │──┤                                   │  (Render 免费层)  │
│  │ 轮询/SSE 客户端    │  │                                   │                   │
│  └───────────────────┘  │                                   │  ┌─────────────┐  │
│  DesktopPet ──→ 提醒     │                                   │  │ 课表爬虫     │  │
└─────────────────────────┘                                   │  │ 成绩爬虫     │  │
                                                              │  └─────────────┘  │
┌─────────────────────────┐          HTTPS/WX API             │  ┌─────────────┐  │
│  微信小程序              │ ◄──────────────────────────────►  │  │ 小程序 API   │  │
│  ┌───────────────────┐  │      (云调用 / 直接 HTTP)          │  └─────────────┘  │
│  │ 课表页面           │  │                                   └──────┬───────────┘
│  │ 成绩页面           │  │                                          │
│  │ 快捷操作           │  │                                   ┌──────┴───────────┐
│  └───────────────────┘  │                                   │  学校教务系统      │
└─────────────────────────┘                                   │  (统一身份认证)    │
                                                              │  jwxt.njust.edu.cn│
                                                              └──────────────────┘
```

## 二、数据流

```
┌──────────────┐    ①定时抓取     ┌──────────┐
│  学校教务系统  │ ──────────────► │  云服务器  │
│  (课表/成绩)  │                  │  SQLite   │
└──────────────┘                  └─────┬────┘
                                        │ ②SSE/轮询
                                        ▼
                                 ┌──────────────┐
                          ┌─────►│  桌面端(符玄)  │
                          │      │  主动提醒      │
                          │      └──────────────┘
                          │
                    ┌─────┴──────┐
                    │  微信小程序  │
                    │  查课表/成绩 │
                    └────────────┘
```

**数据流向：**

| 步骤 | 说明 | 触发时机 |
|------|------|----------|
| ① | 云服务器模拟登录教务系统，抓取课表/成绩 | 定时（每天凌晨/每小时） |
| ② | 桌面端轮询云服务器「有新数据？」接口 | 每 30~60 秒 |
| ③ | 符玄收到新课表/成绩 → 主动气泡提醒 | 实时 |
| ④ | 用户打开小程序 → 显示课表/成绩 | 用户主动 |

## 三、云服务器设计

### 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 框架 | Node.js + Express | 轻量，免费层友好 |
| 数据库 | SQLite (better-sqlite3) | 零配置，单文件 |
| 部署 | Render.com 免费版 | 自动 HTTPS，免运维 |
| 课表爬虫 | Puppeteer / cheerio + axios | 根据教务系统自选 |

### API 接口设计

#### 3.1 面向桌面端

```
GET  /api/pet/poll?lastId=xxx
  → { status: "ok" | "no_new", data: [...] }
  → 桌面端每 30s 调用一次，获取推送消息

POST /api/pet/heartbeat
  → { status: "ok" }
  → 桌面端每 5 分钟上报在线状态

POST /api/pet/reminder/sync
  body: { reminders: [...] }
  → 桌面端同步便签到云端（小程序可查看）
```

#### 3.2 面向小程序

```
GET  /api/schedule?week=1
  → { status: "ok", data: { week: 1, courses: [...] } }

GET  /api/score
  → { status: "ok", data: { scores: [...], gpa: ... } }

GET  /api/exam
  → { status: "ok", data: { exams: [...] } }

GET  /api/reminders
  → 查看桌面端同步过来的便签列表
```

#### 3.3 推送消息结构

```json
{
  "id": "uuid",
  "type": "schedule_reminder" | "score_update" | "exam_reminder" | "custom",
  "title": "明天课表",
  "body": "明天第一节课: 高等数学 (08:00-09:40) @ 教三-201",
  "createdAt": "2026-06-19T22:00:00Z",
  "payload": { }
}
```

### 数据库表设计

```sql
-- 课程表
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER,         -- 第几周
  day INTEGER,          -- 星期几 (0=周一)
  name TEXT,            -- 课程名
  teacher TEXT,         -- 教师
  location TEXT,        -- 教室
  start_slot INTEGER,   -- 第几节开始
  end_slot INTEGER,     -- 第几节结束
  start_time TEXT,      -- 开始时间 (HH:mm)
  end_time TEXT         -- 结束时间 (HH:mm)
);

-- 成绩表
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_name TEXT,
  score REAL,
  credit REAL,
  semester TEXT,
  exam_type TEXT        -- 期末/补考/重修
);

-- 推送消息表
CREATE TABLE push_messages (
  id TEXT PRIMARY KEY,
  type TEXT,
  title TEXT,
  body TEXT,
  created_at TEXT,
  delivered INTEGER DEFAULT 0  -- 桌面端是否已拉取
);

-- 便签同步表
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  text TEXT,
  remind_at TEXT,
  done INTEGER DEFAULT 0,
  source TEXT DEFAULT 'desktop',
  synced_at TEXT
);
```

## 四、桌面端修改方案

### 新增文件

**`CloudBridge.cs`** — 云服务器通信模块

```csharp
// 位置: Assets/Scripts/CloudBridge.cs

public class CloudBridge : MonoBehaviour
{
    [Header("云服务器配置")]
    public string serverUrl = "https://your-app.onrender.com";
    public float pollInterval = 30f;  // 轮询间隔(秒)

    private string _lastMessageId = "";
    private float _pollTimer;

    void Start()
    {
        StartCoroutine(HeartbeatRoutine());
        // 启动时立刻拉取一次
        PollMessages();
    }

    void Update()
    {
        _pollTimer -= Time.deltaTime;
        if (_pollTimer <= 0)
        {
            _pollTimer = pollInterval;
            PollMessages();
        }
    }

    async void PollMessages()
    {
        // GET /api/pet/poll?lastId=xxx
        // 有新的推送消息 → 通知 DesktopPet → 气泡提醒
    }

    IEnumerator HeartbeatRoutine()
    {
        while (true)
        {
            // POST /api/pet/heartbeat
            yield return new WaitForSeconds(300f); // 5分钟
        }
    }
}
```

### 需修改的文件

| 文件 | 修改内容 |
|------|----------|
| `DesktopPet.cs` | Start() 中自动添加 CloudBridge 组件 |
| `ReminderManager.cs` | 增删改便签后同步到云服务器 `POST /api/pet/reminder/sync` |
| `TimeWeatherController.cs` | 新增推送消息 → 触发气泡（如"明天有考试！"） |

### 提醒触发逻辑

```csharp
// DesktopPet 收到新消息后的处理链
CloudBridge.OnNewMessage += (msg) => {
    switch (msg.type)
    {
        case "schedule_reminder":
            // "明天第一节课是高数哦~"
            chatBubble.ShowMessage(msg.body, 8f);
            break;
        case "score_update":
            // "你的XX成绩出来了！"
            chatBubble.ShowMessage(msg.body, 8f);
            break;
        case "exam_reminder":
            // "后天有XX考试，别忘了复习~"
            chatBubble.ShowMessage(msg.body, 8f);
            break;
    }
};
```

## 五、微信小程序设计

### 页面结构

```
pages/
├── index/               ← 首页（今日课表 + 快捷入口）
│   ├── index.wxml
│   ├── index.js
│   └── index.wxss
├── schedule/            ← 完整课表（周切换）
│   ├── schedule.wxml
│   ├── schedule.js
│   └── schedule.wxss
├── scores/              ← 成绩列表
├── exams/               ← 考试安排
├── reminders/           ← 查看桌面端便签
└── settings/            ← 设置（教务账号绑定等）
```

### 主要功能

| 功能 | 描述 |
|------|------|
| **今日课表** | 首页显示当日课程（节次、教室） |
| **周课表** | 左右滑动切换周次 |
| **成绩查询** | 显示各科成绩 + GPA |
| **考试安排** | 显示考试时间地点 |
| **桌面便签** | 同步查看桌面端的便签 |
| **推送开关** | 控制哪些提醒推到桌面端 |

### 教务系统登录方案

由于学校教务系统需要统一身份认证登录，有以下方案：

**方案 A：服务器端模拟登录（推荐）**
- 小程序输入学号+密码 → 传给云服务器
- 云服务器模拟登录教务系统 → 获取 Cookie/Session
- 定时用 Cookie 抓取课表/成绩
- ⚠️ 密码仅用于首次登录获取 token，不存储明文

**方案 B：学校开放 API**
- 如果学校提供了开放 API（如今日校园/微服务平台）
- 直接用 API 获取数据，无需模拟登录

**方案 C：手动导入文件**
- 从教务系统导出课表文件 → 上传到小程序
- 最简单但不够自动化

> 建议先用 **方案 C** 做起来（手动导入课表文件），后续再升级到 **方案 A**（自动抓取）

## 六、部署方案

### 云服务器（Render 免费版）

```
1. 在 render.com 注册账号
2. 新建 Web Service → 连接 GitHub 仓库
3. 选 Free 计划 (750h/月, 够用了)
4. 自动 HTTPS → https://your-app.onrender.com
```

### 后续升级路径

| 阶段 | 要做的 | 时间估计 |
|------|--------|----------|
| **Phase 1** | 云服务器 + 桌面端 CloudBridge + 手动测试推送 | 2-3 天 |
| **Phase 2** | 微信小程序基础版（展示课表/成绩） | 3-5 天 |
| **Phase 3** | 教务系统对接（自动抓取） | 2-3 天 |
| **Phase 4** | 符玄主动提醒 + 小程序联动 | 1-2 天 |

## 七、安全考虑

- 教务密码不在小程序端存储，仅服务器 Session 缓存
- 云服务器 API 使用简单 Token 认证（防止随意调用）
- 桌面端 Token 写在 ChatConfig.cs（已 gitignored）
- HTTPS 加密传输

---

## 下一步

选择你想从哪个阶段开始：

1. **立刻开始 Phase 1** → 我写云服务器代码 + 桌面端 CloudBridge
2. **先完善设计** → 我们再讨论教务对接细节
3. **先做小程序** → 基于「梨课程」的功能重建一个小程序
