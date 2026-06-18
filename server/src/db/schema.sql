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

-- 成绩表
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_name TEXT NOT NULL,
  score REAL NOT NULL,
  credit REAL DEFAULT 0,
  semester TEXT NOT NULL,
  exam_type TEXT DEFAULT '期末',
  created_at TEXT DEFAULT (datetime('now'))
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
