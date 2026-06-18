const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const njust = require('../services/njust');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'njust-schedule-default-key-32chr!';

// 加密密码（简单 AES-256-GCM）
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(text) {
  const [ivHex, tagHex, encHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(ENCRYPTION_KEY).digest(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}

// 鉴权中间件
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.MINI_TOKEN}`) {
    return res.status(401).json({ status: 'error', message: '未授权' });
  }
  next();
}

// ========== 用户/登录相关 ==========

// 绑定教务账号
router.post('/user/bind', auth, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ status: 'error', message: '学号和密码不能为空' });
  }

  try {
    const password_enc = encrypt(password);
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      db.run('UPDATE users SET password_enc = ? WHERE username = ?', [password_enc, username]);
    } else {
      db.run('INSERT INTO users (username, password_enc) VALUES (?, ?)', [username, password_enc]);
    }
    res.json({ status: 'ok', message: '账号已绑定' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 手动刷新教务数据（课表+成绩）
router.post('/refresh', auth, async (req, res) => {
  const db = getDB();
  try {
    // 找第一个已绑定的用户
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) {
      return res.status(400).json({ status: 'error', message: '请先在设置中绑定教务账号' });
    }

    const password = decrypt(user.password_enc);
    const result = await njust.login(user.username, password);
    
    // 获取课表和成绩
    const courses = await njust.fetchSchedule(result.cookie);
    const scoreResult = await njust.fetchScores(result.cookie);
    const currentSem = await njust.getCurrentSemester(result.cookie);

    // 更新学期
    db.run('UPDATE users SET semester = ?, last_login_at = datetime(\'now\') WHERE id = ?', [currentSem, user.id]);

    res.json({
      status: 'ok',
      data: {
        courses_count: courses.length,
        scores_count: scoreResult.scores.length,
        new_scores_count: scoreResult.newScores.length,
        semester: currentSem
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 获取登录状态
router.get('/user/status', auth, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, username, semester, last_login_at FROM users LIMIT 1').get();
  res.json({ status: 'ok', data: { bound: !!user, user } });
});

// ========== 数据查询 ==========

// 获取课表 - 按周次
router.get('/schedule', auth, (req, res) => {
  const week = parseInt(req.query.week) || 1;
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM courses WHERE week = ? ORDER BY day, start_slot'
  ).all(week);

  res.json({ status: 'ok', data: { week, courses: rows } });
});

// 获取所有成绩
router.get('/scores', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM scores ORDER BY semester DESC, course_name'
  ).all();

  res.json({ status: 'ok', data: { scores: rows } });
});

// 获取考试安排
router.get('/exams', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM push_messages WHERE type = ? ORDER BY created_at DESC'
  ).all('exam_reminder');

  const exams = rows.map(r => ({
    ...JSON.parse(r.payload || '{}'),
    title: r.title,
    body: r.body,
    id: r.id
  }));

  res.json({ status: 'ok', data: { exams } });
});

// 获取桌面端便签
router.get('/reminders', auth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM reminders ORDER BY created_at DESC LIMIT 50'
  ).all();

  res.json({ status: 'ok', data: { reminders: rows } });
});

// 小程序触发推送消息（手动测试用）
router.post('/push', auth, (req, res) => {
  const { type, title, body, payload } = req.body;
  if (!type || !title || !body) {
    return res.status(400).json({ status: 'error', message: '缺少必填字段' });
  }

  const { v4: uuidv4 } = require('uuid');
  const db = getDB();
  const id = uuidv4();

  db.run(
    `INSERT INTO push_messages (id, type, title, body, payload) VALUES (?, ?, ?, ?, ?)`,
    [id, type, title, body, JSON.stringify(payload || {})]
  );

  res.json({ status: 'ok', messageId: id });
});

module.exports = router;
