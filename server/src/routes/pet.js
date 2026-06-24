const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const log = require('../utils/logger');

// 鉴权：同时支持 DESKTOP_TOKEN 和 MINI_TOKEN
function auth(req, res, next) {
  const token = req.headers.authorization;
  const validTokens = [
    `Bearer ${process.env.DESKTOP_TOKEN}`,
    `Bearer ${process.env.MINI_TOKEN}`,
  ];
  if (!validTokens.includes(token)) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  next();
}

// ============================================================
// 桌面端轮询（已有接口，保持兼容）
// ============================================================

router.get('/poll', auth, (req, res) => {
  const lastId = req.query.lastId || '';
  const db = getDB();

  let rows;
  if (lastId) {
    rows = db.prepare(
      `SELECT * FROM push_messages WHERE id > ? AND delivered = 0 ORDER BY created_at ASC`
    ).all(lastId);
  } else {
    rows = db.prepare(
      `SELECT * FROM push_messages WHERE delivered = 0 ORDER BY created_at ASC LIMIT 50`
    ).all();
  }

  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE push_messages SET delivered = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  res.json({
    status: rows.length > 0 ? 'ok' : 'no_new',
    data: rows,
    lastId: rows.length > 0 ? rows[rows.length - 1].id : lastId
  });
});

router.post('/heartbeat', auth, (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 桌面端同步便签（保持兼容，转发到 mini.js 的 CRUD）
router.post('/reminder/sync', auth, (req, res) => {
  const { reminders } = req.body;
  if (!Array.isArray(reminders)) {
    return res.status(400).json({ status: 'error', message: 'reminders 必须是数组' });
  }

  const db = getDB();
  const upsert = db.prepare(`
    INSERT INTO reminders (id, text, remind_at, done, priority, category, tags, link_type, link_id, source, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'desktop', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      text = excluded.text,
      remind_at = excluded.remind_at,
      done = excluded.done,
      priority = excluded.priority,
      category = excluded.category,
      tags = excluded.tags,
      synced_at = datetime('now')
  `);

  for (const r of reminders) {
    upsert.run(r.id, r.text, r.remindAt || null, r.done ? 1 : 0,
      r.priority || 0, r.category || 'default', r.tags || '',
      r.linkType || '', r.linkId || '');
  }

  const all = db.prepare('SELECT * FROM reminders ORDER BY priority DESC, created_at DESC LIMIT 100').all();
  res.json({ status: 'ok', count: reminders.length, data: { reminders: all } });
});

// ============================================================
// AI 记忆系统（pet_memory 表 CRUD）
// ============================================================

// 获取所有记忆（供 AI 初始化时加载）
router.get('/memory', auth, (req, res) => {
  const db = getDB();
  const { type } = req.query;
  let rows;
  if (type) {
    rows = db.prepare('SELECT * FROM pet_memory WHERE type = ? ORDER BY updated_at DESC').all(type);
  } else {
    rows = db.prepare('SELECT * FROM pet_memory ORDER BY type, updated_at DESC').all();
  }
  res.json({ status: 'ok', data: { memories: rows } });
});

// 新增/更新记忆（AI 自主学习写入）
router.post('/memory', auth, (req, res) => {
  const { type, key, value, context, confidence, source } = req.body;
  if (!type || !key || value === undefined) {
    return res.status(400).json({ status: 'error', message: 'type/key/value 必填' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM pet_memory WHERE type = ? AND key = ?').get(type, key);

  if (existing) {
    db.run(
      `UPDATE pet_memory SET value = ?, context = ?, confidence = ?, source = ?, updated_at = datetime('now')
       WHERE type = ? AND key = ?`,
      [String(value), JSON.stringify(context || {}), confidence || 0.5, source || 'ai', type, key]
    );
  } else {
    db.run(
      `INSERT INTO pet_memory (id, type, key, value, context, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), type, key, String(value), JSON.stringify(context || {}), confidence || 0.5, source || 'ai']
    );
  }

  log.info(`[Pet] 记忆更新: ${type}/${key} = ${value}`);
  res.json({ status: 'ok' });
});

// 批量记忆同步（AI 全量更新用）
router.post('/memory/batch', auth, (req, res) => {
  const { memories } = req.body;
  if (!Array.isArray(memories) || memories.length === 0) {
    return res.status(400).json({ status: 'error', message: 'memories 必须是数组' });
  }

  const db = getDB();
  let updated = 0;

  for (const m of memories) {
    if (!m.type || !m.key || m.value === undefined) continue;
    const existing = db.prepare('SELECT id FROM pet_memory WHERE type = ? AND key = ?').get(m.type, m.key);
    if (existing) {
      db.run(
        `UPDATE pet_memory SET value = ?, context = ?, confidence = ?, source = ?, updated_at = datetime('now')
         WHERE type = ? AND key = ?`,
        [String(m.value), JSON.stringify(m.context || {}), m.confidence || 0.5, m.source || 'ai', m.type, m.key]
      );
    } else {
      db.run(
        `INSERT INTO pet_memory (id, type, key, value, context, confidence, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), m.type, m.key, String(m.value), JSON.stringify(m.context || {}), m.confidence || 0.5, m.source || 'ai']
      );
    }
    updated++;
  }

  res.json({ status: 'ok', count: updated });
});

// 删除记忆
router.delete('/memory/:type/:key', auth, (req, res) => {
  const db = getDB();
  db.run('DELETE FROM pet_memory WHERE type = ? AND key = ?', [req.params.type, req.params.key]);
  res.json({ status: 'ok' });
});

// ============================================================
// AI 互动日志
// ============================================================

// 记录互动
router.post('/interaction', auth, (req, res) => {
  const { type, content, metadata, user_satisfaction } = req.body;
  if (!type || !content) {
    return res.status(400).json({ status: 'error', message: 'type/content 必填' });
  }

  const db = getDB();
  const id = uuidv4();
  db.run(
    `INSERT INTO pet_interactions (id, type, content, metadata, user_satisfaction)
     VALUES (?, ?, ?, ?, ?)`,
    [id, type, content, JSON.stringify(metadata || {}), user_satisfaction || 0]
  );

  res.json({ status: 'ok', id });
});

// 查询互动历史（供 AI 参考）
router.get('/interactions', auth, (req, res) => {
  const db = getDB();
  const { type, limit } = req.query;
  let sql = 'SELECT * FROM pet_interactions';
  const params = [];

  if (type) { sql += ' WHERE type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC';
  sql += ' LIMIT ?';
  params.push(parseInt(limit) || 50);

  const rows = db.prepare(sql).all(...params);
  res.json({ status: 'ok', data: { interactions: rows } });
});

// ============================================================
// AI 统一数据概览（一条命令获取全量信息——用于构建 System Prompt）
// ============================================================

router.get('/overview', auth, (req, res) => {
  const db = getDB();

  // 用户信息
  const user = db.prepare('SELECT username, semester, last_login_at FROM users LIMIT 1').get() || {};

  // 统计概览
  const scoreCount = db.prepare('SELECT COUNT(*) as c FROM scores').get()?.c || 0;
  const courseCount = db.prepare('SELECT COUNT(*) as c FROM courses').get()?.c || 0;
  const examCount = db.prepare('SELECT COUNT(*) as c FROM exams').get()?.c || 0;
  const reminderPending = db.prepare('SELECT COUNT(*) as c FROM reminders WHERE done = 0').get()?.c || 0;
  const memoryCount = db.prepare('SELECT COUNT(*) as c FROM pet_memory').get()?.c || 0;

  // 待办便签（最重要的优先）
  const pendingReminders = db.prepare(
    'SELECT id, text, priority, category, tags, remind_at, link_type FROM reminders WHERE done = 0 ORDER BY priority DESC, created_at DESC LIMIT 10'
  ).all();

  // 最近考试成绩
  const recentScores = db.prepare(
    'SELECT course_name, score, credit, semester FROM scores ORDER BY semester DESC, course_name LIMIT 15'
  ).all();

  // 即将到来的考试（未来 30 天内）
  const today = new Date().toISOString().slice(0, 10);
  const futureExams = db.prepare(
    "SELECT course_name, exam_date, start_time, end_time, location FROM exams WHERE exam_date >= ? ORDER BY exam_date LIMIT 10"
  ).all(today);

  // 今天课表
  const now = new Date();
  const day = now.getDay() === 0 ? 0 : now.getDay();
  const currentWeek = _getCurrentWeek();
  const todayCourses = db.prepare(
    'SELECT name, start_slot, end_slot, start_time, end_time, location, teacher FROM courses WHERE week = ? AND day = ? ORDER BY start_slot'
  ).all(currentWeek, day);

  // 所有记忆
  const memories = db.prepare('SELECT type, key, value, confidence FROM pet_memory ORDER BY type').all();

  // 最近互动
  const recentInteractions = db.prepare(
    "SELECT type, content, user_satisfaction, created_at FROM pet_interactions ORDER BY created_at DESC LIMIT 5"
  ).all();

  res.json({
    status: 'ok',
    data: {
      user,
      stats: { scoreCount, courseCount, examCount, reminderPending, memoryCount },
      todayCourses,
      pendingReminders,
      recentScores,
      futureExams,
      memories,
      recentInteractions,
      _currentWeek: currentWeek,
    }
  });
});

// ============================================================
// AI 便签智能操作（让 AI 可以创建/完成/删除便签）
// ============================================================

// AI 智能创建便签（自动分类和标签）
router.post('/reminder/auto', auth, (req, res) => {
  const { text, remind_at, priority } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ status: 'error', message: '内容不能为空' });
  }

  // 自动分类：根据文本内容猜测类别
  const lower = text.toLowerCase();
  let category = 'default';
  if (/考试|复习|备考|exam/i.test(lower)) category = 'exam';
  else if (/作业|课程|上课|project|论文|报告/i.test(lower)) category = 'study';
  else if (/体检|运动|跑步|健身|睡眠|吃药/i.test(lower)) category = 'health';
  else if (/开会|工作|任务|deadline/i.test(lower)) category = 'work';
  else if (/生日|聚会|旅游|看电影|吃饭|约会/i.test(lower)) category = 'life';

  // 自动提取标签：匹配关键词
  const tags = [];
  const tagPatterns = {
    '考试': '考试', '复习': '复习', '作业': '作业', '课程': '课程',
    '生日': '生日', '聚会': '聚会', '运动': '运动', '会议': '会议',
  };
  for (const [kw, tag] of Object.entries(tagPatterns)) {
    if (lower.includes(kw)) tags.push(tag);
  }
  const tagsStr = tags.join(',');

  const db = getDB();
  const id = uuidv4();
  db.run(
    `INSERT INTO reminders (id, text, remind_at, priority, category, tags, source)
     VALUES (?, ?, ?, ?, ?, ?, 'ai')`,
    [id, text.trim(), remind_at || null, priority || 0, category, tagsStr]
  );

  log.info(`[Pet-AI] 智能创建便签 [${category}] ${id}: ${text}`);
  res.json({ status: 'ok', data: { id, category, tags: tagsStr } });
});

// AI 批量完成便签
router.post('/reminder/batch-done', auth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ status: 'error', message: 'ids 必须是数组' });
  }

  const db = getDB();
  let done = 0;
  for (const id of ids) {
    const r = db.run('UPDATE reminders SET done = 1, auto_done = 1, synced_at = datetime(\'now\') WHERE id = ?', [id]);
    if (r.changes > 0) done++;
  }

  res.json({ status: 'ok', count: done });
});

// ============================================================
// 辅助函数
// ============================================================

function _getCurrentWeek() {
  const starts = [
    { start: '2025-09-01', label: '2025-2026-1' },
    { start: '2026-02-23', label: '2025-2026-2' },
    { start: '2026-09-07', label: '2026-2027-1' },
  ];
  const now = new Date();
  for (const s of starts) {
    const start = new Date(s.start);
    const end = new Date(start);
    end.setDate(end.getDate() + 20 * 7);
    if (now >= start && now < end) {
      const diff = now - start;
      return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
    }
  }
  return 1;
}

module.exports = router;
