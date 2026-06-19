-- 用户表（存储登录凭证，密码加密存储）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,     -- 学号
  password_enc TEXT NOT NULL,        -- 加密后的密码（AES-GCM）
  semester TEXT DEFAULT '',          -- 当前学期
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 课程表
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL,       -- 第几周
  day INTEGER NOT NULL,        -- 星期几 (0=周一, 6=周日)
  name TEXT NOT NULL,           -- 课程名
  teacher TEXT DEFAULT '',      -- 教师
  location TEXT DEFAULT '',     -- 教室
  start_slot INTEGER NOT NULL, -- 开始节次
  end_slot INTEGER NOT NULL,   -- 结束节次
  start_time TEXT NOT NULL,    -- HH:mm
  end_time TEXT NOT NULL,      -- HH:mm
  created_at TEXT DEFAULT (datetime('now'))
);

-- 成绩表（兼容旧格式+桥接服务新字段）
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semester TEXT NOT NULL,
  course_code TEXT DEFAULT '',
  course_name TEXT NOT NULL,
  score TEXT DEFAULT '',              -- 成绩（数字或等级：优/良/中）
  credit REAL DEFAULT 0,
  hours INTEGER DEFAULT 0,           -- 总学时
  exam_type TEXT DEFAULT '',
  attribute TEXT DEFAULT '',         -- 课程属性（必修/任选/计划外）
  nature TEXT DEFAULT '',            -- 课程性质（学科教育课/通识教育课）
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(semester, course_code, course_name)
);

-- 推送消息队列（桌面端轮询拉取）
CREATE TABLE IF NOT EXISTS push_messages (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- schedule_reminder / score_update / exam_reminder / custom
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT DEFAULT '{}',    -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered INTEGER DEFAULT 0   -- 0=未推送 1=已推送
);

-- 桌面端便签同步
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  remind_at TEXT,
  done INTEGER DEFAULT 0,
  source TEXT DEFAULT 'desktop',
  created_at TEXT DEFAULT (datetime('now')),
  synced_at TEXT DEFAULT (datetime('now'))
);

-- 考试安排表
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_name TEXT NOT NULL,
  exam_date TEXT NOT NULL,       -- YYYY-MM-DD
  start_time TEXT NOT NULL,      -- HH:mm
  end_time TEXT NOT NULL,        -- HH:mm
  location TEXT DEFAULT '',      -- 考场
  seat_no TEXT DEFAULT '',       -- 座位号
  exam_type TEXT DEFAULT '',     -- 考试类型（期末/补考等）
  semester TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(course_name, exam_date, start_time)
);
