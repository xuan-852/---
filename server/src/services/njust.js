const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const CryptoJS = require('crypto-js');
const { getDB } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

/**
 * 南理工教务系统对接
 *
 * 教务系统地址: https://jwxt.njust.edu.cn
 * 统一认证: https://ids.njust.edu.cn/authserver
 */

const IDS_URL = 'https://ids.njust.edu.cn/authserver';
const JWXT_URL = 'https://jwxt.njust.edu.cn/jsxsd';

// 创建可复用 axios 实例（忽略 SSL 证书验证）
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 与新认证系统 encrypt.js 一致的字符集
const AES_CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';

/**
 * 生成随机字符串（与南理工新认证系统一致）
 */
function randomString(n) {
  let result = '';
  for (let i = 0; i < n; i++) {
    result += AES_CHARS.charAt(Math.floor(Math.random() * AES_CHARS.length));
  }
  return result;
}

/**
 * AES-256-CBC 加密（与南理工新认证系统 encrypt.js 一致）
 * @param {string} data 明文
 * @param {string} key  密钥（salt）
 * @param {string} iv   初始向量
 * @returns {string} Base64 编码的密文
 */
function getAesString(data, key, iv) {
  // 与原版 encrypt.js 的 getAesString 完全一致: key 需 Utf8.parse 为 WordArray
  const parsedKey = CryptoJS.enc.Utf8.parse(key.trim());
  const parsedIv = CryptoJS.enc.Utf8.parse(iv);
  const encrypted = CryptoJS.AES.encrypt(data, parsedKey, {
    iv: parsedIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return encrypted.toString(); // 返回 Base64
}

/**
 * encryptPassword —— 完全复现南理工新认证系统的加密流程
 * randomString(64) + password 作为加密数据
 * salt 作为密钥
 * randomString(16) 作为 IV
 */
function encryptPassword(password, salt) {
  return salt ? getAesString(randomString(64) + password, salt, randomString(16)) : password;
}

/**
 * 统一身份认证登录 - 南理工新认证系统 (ids.njust.edu.cn)
 * 
 * 流程（2026年6月实网验证通过）：
 *   1. GET /authserver/login → 获取 Cookie、execution、pwdEncryptSalt
 *   2. GET /authserver/getCaptcha.htl → 获取验证码
 *   3. 密码 AES-256-CBC 加密（randomString(64)+密码）
 *   4. POST 提交表单（含验证码、加密密码、execution 等）
 *   5. 成功返回 302 + CASTGC 票据（无 service 时跳转 /authserver/index.do）
 * 
 * ⚠️ 注意：jwxt.njust.edu.cn 所有路径目前返回 404（学校服务器反向代理未配置）
 *   且 service URL 在 IDS 中未注册（"应用未注册"）。
 *   本登录函数验证通过后获取 IDS 会话（CASTGC），但无法进一步获取课表/成绩，
 *   需要等学校修复教务系统后端后，配合正确的 service URL 才能完整使用。
 * 
 * @param {string} username 学号
 * @param {string} password 密码
 * @param {string} captcha 验证码（可选，默认尝试无验证码登录）
 * @param {string} [service] 可选 service URL（当前未注册，传了会返回"应用未注册"）
 * @returns {Promise<{cookie: string, sessionCookie: string, hasCASTGC: boolean}>}
 */
async function login(username, password, captcha, service) {
  // Step 1: GET 登录页 → 获取 Cookie 和隐藏参数
  const loginUrl = service
    ? `${IDS_URL}/login?service=${encodeURIComponent(service)}`
    : `${IDS_URL}/login`;
  
  const loginPageRes = await axios.get(loginUrl, {
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    maxRedirects: 0,
    validateStatus: s => s < 400
  });

  const setCookie = loginPageRes.headers['set-cookie'] || [];
  const cookie = setCookie.map(c => c.split(';')[0]).join('; ');

  // 检查是否是"应用未注册"页面（传了 service 但未注册）
  const pageHtml = loginPageRes.data || '';
  if (pageHtml.includes('应用未注册')) {
    throw new Error('service URL 在 IDS 中未注册，请检查教务系统状态或使用不带 service 的登录');
  }

  const $ = cheerio.load(pageHtml);
  const execution = $('#pwdFromId input[name="execution"]').val();
  const lt = $('#pwdFromId input[name="lt"]').val() || '';
  const _eventId = $('#pwdFromId input[name="_eventId"]').val() || 'submit';
  const cllt = $('#pwdFromId input[name="cllt"]').val() || 'userNameLogin';
  const dllt = $('#pwdFromId input[name="dllt"]').val() || 'generalLogin';
  const pwdEncryptSalt = $('#pwdEncryptSalt').val() || '';
  const captchaSwitch = $('#captchaSwitch').val() || '';

  if (!execution) throw new Error('无法获取 execution 参数，登录页面格式可能已变更');
  if (!pwdEncryptSalt) throw new Error('无法获取 pwdEncryptSalt 参数');

  // 加密密码（完全复现前端 encrypt.js 逻辑）
  const encryptedPassword = encryptPassword(password, pwdEncryptSalt);

  // Step 2: 如果需要验证码，先获取验证码图片
  let captchaCode = captcha || '';
  if (!captchaCode && (captchaSwitch === '1' || pageHtml.includes('getCaptcha'))) {
    // 需要验证码但没有传入，抛出提示
    throw new Error('需要验证码，请调用 loginGetCaptcha() 获取验证码后重试');
  }

  // Step 3: POST 提交登录表单
  const postData = {
    username,
    password: encryptedPassword,
    _eventId,
    cllt,
    dllt,
    lt,
    execution,
    captcha: captchaCode,
    rememberMe: 'true'
  };
  if (service) postData.service = service;

  const loginRes = await axios.post(loginUrl,
    new URLSearchParams(postData).toString(),
    {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
        'Referer': loginUrl
      },
      maxRedirects: 0,
      validateStatus: s => true
    }
  );

  // Step 4: 判断登录结果
  const location = loginRes.headers['location'] || '';

  // 检查 ticket（有 service 参数时）
  const ticketMatch = location.match(/ticket=([^&]+)/);
  if (ticketMatch) {
    return { cookie, sessionCookie: cookie, hasCASTGC: true, ticket: ticketMatch[1], location };
  }

  // 无 service 参数时，302 跳转到 /authserver/index.do + CASTGC 也说明成功
  const hasCASTGC = (loginRes.headers['set-cookie'] || []).some(c => c.includes('CASTGC='));
  if (loginRes.status === 302 && hasCASTGC) {
    return { cookie, sessionCookie: cookie, hasCASTGC: true, location };
  }

  // 登录失败——提取错误信息
  const errHtml = loginRes.data || '';
  const $err = cheerio.load(errHtml);
  let errMsg = $err('#showErrorTip').text().trim() ||
               $err('.error-tip').text().trim() ||
               $err('#msg').text().trim() ||
               errHtml.match(/图形动态码错误/)?.[0] ||
               errHtml.match(/账号或密码有误/)?.[0] || '';
  throw new Error(errMsg || `登录失败 (status=${loginRes.status})`);
}

/**
 * 获取 IDS 验证码图片（Base64 格式）
 * 需要在调用 login() 之前使用，且需要先 getLoginPage() 获取 cookie
 * @returns {Promise<{cookie: string, captcha: Buffer, execution: string, salt: string}>}
 */
async function loginGetCaptcha() {
  // 先获取登录页获取会话
  const r1 = await axios.get(`${IDS_URL}/login`, {
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    maxRedirects: 0,
    validateStatus: s => s < 400
  });
  const cookie = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const $ = cheerio.load(r1.data);
  const execution = $('#pwdFromId input[name="execution"]').val();
  const salt = $('#pwdEncryptSalt').val();

  // 获取验证码图片
  const captchaRes = await axios.get(`${IDS_URL}/getCaptcha.htl?${Date.now()}`, {
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookie },
    responseType: 'arraybuffer',
    validateStatus: s => true
  });

  return { cookie, captcha: Buffer.from(captchaRes.data), execution, salt };
}

/**
 * 获取课表数据
 * @param {string} cookie 登录后的 Cookie
 * @param {string} semester 学期代号，如 2025-2026-2
 * @returns {Promise<Array>} 课程列表
 */
async function fetchSchedule(cookie, semester) {
  // 获得当前学期
  if (!semester) {
    semester = await getCurrentSemester(cookie);
  }

  // 访问课表页面
  const scheduleRes = await axios.get(`${JWXT_URL}/xskb/xskb_list.do`, {
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookie,
      'Referer': `${JWXT_URL}/`
    },
    validateStatus: s => true
  });

  // 检查教务系统是否返回 404
  if (scheduleRes.status === 404 || (scheduleRes.data || '').includes('errorTips404')) {
    throw new Error('教务系统暂不可达（404），请联系管理员确认 jwxt.njust.edu.cn 是否正常运行');
  }

  const courses = parseScheduleHTML(scheduleRes.data, semester);

  // 存入数据库
  saveCoursesToDB(courses);

  return courses;
}

/**
 * 获取成绩数据
 * @param {string} cookie 登录后的 Cookie
 * @returns {Promise<Array>} 成绩列表
 */
async function fetchScores(cookie) {
  // 访问成绩页面 - 南理工成绩查询 URL
  const scoreRes = await axios.get(`${JWXT_URL}/kscj/cjcx_list.do`, {
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookie,
      'Referer': `${JWXT_URL}/`
    },
    validateStatus: s => true
  });

  // 检查教务系统是否返回 404
  if (scoreRes.status === 404 || (scoreRes.data || '').includes('errorTips404')) {
    throw new Error('教务系统暂不可达（404），请联系管理员确认 jwxt.njust.edu.cn 是否正常运行');
  }

  const scores = parseScoreHTML(scoreRes.data);

  // 存入数据库并推送新成绩通知
  const newScores = saveScoresToDB(scores);

  return { scores, newScores };
}

/**
 * 抓取考试安排
 */
async function fetchExams(cookie) {
  const examRes = await axios.get(`${JWXT_URL}/kscj/ksap_list`, {
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookie,
      'Referer': `${JWXT_URL}/`
    },
    validateStatus: s => true
  });

  if (examRes.status === 404 || (examRes.data || '').includes('errorTips404')) {
    throw new Error('教务系统暂不可达（404），请联系管理员确认 jwxt.njust.edu.cn 是否正常运行');
  }

  const exams = parseExamHTML(examRes.data);

  // 存入数据库
  saveExamsToDB(exams);

  return exams;
}

/**
 * 解析考试安排 HTML
 */
function parseExamHTML(html) {
  const $ = cheerio.load(html);
  const exams = [];

  $('table').each((ti, tbl) => {
    $(tbl).find('tr').each((ri, row) => {
      if (ri === 0) return; // 跳过表头
      const cols = $(row).find('td');
      if (cols.length < 6) return;

      exams.push({
        courseName: $(cols[0]).text().trim(),
        examDate: $(cols[1]).text().trim(),
        startTime: $(cols[2]).text().trim(),
        endTime: $(cols[3]).text().trim(),
        location: $(cols[4]).text().trim(),
        seatNo: $(cols[5]).text().trim(),
      });
    });
  });

  return exams;
}

/**
 * 将考试安排存入数据库（全量替换）
 */
function saveExamsToDB(exams) {
  const db = getDB();
  db.run('DELETE FROM exams');
  let count = 0;
  for (const e of exams) {
    try {
      db.run(
        `INSERT INTO exams (course_name, exam_date, start_time, end_time, location, seat_no, exam_type, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.courseName || '', e.examDate || '', e.startTime || '', e.endTime || '',
         e.location || '', e.seatNo || '', '期末', '']
      );
      count++;
    } catch (err) {
      // 跳过重复
    }
  }
  console.log(`[NJUST] 已导入 ${count} 条考试安排`);
}

/**
 * 获取当前学期代号
 */
async function getCurrentSemester(cookie) {
  try {
    const res = await axios.get(`${JWXT_URL}/`, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie
      }
    });

    const $ = cheerio.load(res.data);
    // 尝试从页面中提取当前学期
    const semText = $('.xnxq').text() || $('select[name="xnxq"] option[selected]').text() || '';
    if (semText) return semText.trim();

    // 从已知格式推断：2025-2026-2
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (month >= 2 && month <= 7) return `${year - 1}-${year}-2`;  // 春季学期
    if (month >= 8 && month <= 12) return `${year}-${year + 1}-1`; // 秋季学期
    return `${year - 1}-${year}-2`; // 默认春季
  } catch {
    // 默认推断
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    if (m >= 2 && m <= 7) return `${y - 1}-${y}-2`;
    return `${y}-${y + 1}-1`;
  }
}

/**
 * 解析课表 HTML → 结构化课程列表
 * 南理工课表通常是 <table> 形式，每格包含课程名称、教师、地点、周次
 */
function parseScheduleHTML(html, semester) {
  const $ = cheerio.load(html);
  const courses = [];

  // 尝试多种 table 选择器
  const tables = $('table').filter((i, el) => {
    const text = $(el).text();
    return text.includes('节') || text.includes('星期') || text.includes('课程') || text.includes('名称');
  });

  if (tables.length === 0) {
    // 备用：直接查找含课表内容的 table
    const $2 = cheerio.load(html, { decodeEntities: false });
    $2('table').each((ti, tbl) => {
      const $tbl = $2(tbl);
      $tbl.find('tr').each((ri, row) => {
        const $row = $2(row);
        $row.find('td').each((ci, cell) => {
          const $cell = $2(cell);
          const cellHtml = $cell.html() || '';
          // 跳过表头和节次列
          if (ri === 0 || ci === 0) return;
          
          // 尝试提取课程信息
          const day = ci - 1; // 0=周一
          // 提取开始/结束节次
          const slotMatch = $row.find('td').first().text().match(/(\d+)/);
          if (!slotMatch) return;
          const startSlot = parseInt(slotMatch[1]);
          const endSlot = startSlot;

          // 解析课程信息
          // 格式：课程名<br>教师<br>地点<br>周次
          const parts = cellHtml.split(/<br\s*\/?>/i).map(p => $2(p).text().trim()).filter(Boolean);
          if (parts.length === 0 || !parts[0] || parts[0] === '&nbsp;') return;

          const name = parts[0];
          const teacher = parts[1] || '';
          const location = parts[2] || '';
          const weekInfo = parts[3] || '';

          // 解析周次
          const weeks = parseWeeks(weekInfo);

          const slotTime = getSlotTime(startSlot);

          if (weeks.length > 0) {
            weeks.forEach(w => {
              courses.push({
                week: w,
                day,
                name,
                teacher,
                location,
                start_slot: startSlot,
                end_slot: endSlot,
                start_time: slotTime.start,
                end_time: slotTime.end,
                semester
              });
            });
          } else {
            courses.push({
              week: 1,
              day,
              name,
              teacher,
              location,
              start_slot: startSlot,
              end_slot: endSlot,
              start_time: slotTime.start,
              end_time: slotTime.end,
              semester
            });
          }
        });
      });
    });
    return courses;
  }

  // 标准表格解析
  tables.first().find('tr').each((ri, row) => {
    const $row = $(row);
    const cells = $row.find('td, th');

    cells.each((ci, cell) => {
      const $cell = $(cell);
      if (ri === 0 || ci === 0) return; // 跳过表头和节次列

      const day = ci - 1; // 0=周一
      const firstCellText = cells.first().text().trim();
      const slotMatch = firstCellText.match(/(\d+)/);
      if (!slotMatch) return;
      
      const startSlot = parseInt(slotMatch[1]);
      const cellContent = $cell.html() || '';
      const parts = cellContent.split(/<br\s*\/?>/i).map(p => $(p).text().trim()).filter(Boolean);
      if (parts.length === 0 || parts[0] === '&nbsp;') return;

      const name = parts[0];
      const teacher = parts[1] || '';
      const location = parts[2] || '';
      const weekInfo = parts[3] || '';

      const weeks = parseWeeks(weekInfo);
      const slotTime = getSlotTime(startSlot);

      if (weeks.length > 0) {
        weeks.forEach(w => {
          courses.push({
            week: w,
            day,
            name,
            teacher,
            location,
            start_slot: startSlot,
            end_slot: startSlot,
            start_time: slotTime.start,
            end_time: slotTime.end,
            semester
          });
        });
      }
    });
  });

  return courses;
}

/**
 * 解析成绩 HTML
 * 南理工成绩页通常是表格，包含课程名、成绩、学分、学期等
 */
function parseScoreHTML(html) {
  const $ = cheerio.load(html);
  const scores = [];

  const $table = $('table').filter((i, el) => {
    const text = $(el).text();
    return text.includes('课程') && text.includes('成绩') && text.includes('学分');
  }).first();

  if ($table.length === 0) {
    // 尝试直接找所有表格
    $('table').each((ti, tbl) => {
      $(tbl).find('tr').each((ri, row) => {
        if (ri === 0) return; // 跳过表头
        const cols = $(row).find('td');
        if (cols.length < 3) return;

        const course_name = $(cols[1]).text().trim();
        const scoreText = $(cols[2]).text().trim();
        const score = parseFloat(scoreText) || scoreText;
        const credit = parseFloat($(cols[3]).text().trim()) || 0;
        let semester = $(cols[0]).text().trim();
        let exam_type = $(cols[4]).text().trim() || '期末';

        if (course_name && score !== undefined && score !== '') {
          scores.push({ course_name, score, credit, semester, exam_type });
        }
      });
    });
    return scores;
  }

  $table.find('tr').each((ri, row) => {
    if (ri === 0) return;
    const cols = $(row).find('td');
    if (cols.length < 3) return;

    const course_name = $(cols[1]).text().trim();
    const scoreText = $(cols[2]).text().trim();
    const score = parseFloat(scoreText) || scoreText;
    const credit = parseFloat($(cols[3]).text().trim()) || 0;
    const semester = $(cols[0]).text().trim();
    const exam_type = $(cols[4]).text().trim() || '期末';

    if (course_name && score !== undefined && score !== '') {
      scores.push({ course_name, score, credit, semester, exam_type });
    }
  });

  return scores;
}

/**
 * 解析周次信息，如 "1-16周" "1,3,5周" "1-8周(单)" 
 */
function parseWeeks(weekStr) {
  if (!weekStr) return [];
  const weeks = [];
  const cleaned = weekStr.replace(/[周\s]/g, '');

  // 处理 "1-16" 或 "1-16(单)" 或 "1-16(双)"
  const rangeMatch = cleaned.match(/(\d+)-(\d+)(\([单双]\))?/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    const oddEven = rangeMatch[3];
    for (let w = start; w <= end; w++) {
      if (oddEven === '(单)' && w % 2 === 0) continue;
      if (oddEven === '(双)' && w % 2 !== 0) continue;
      weeks.push(w);
    }
    return weeks;
  }

  // 处理 "1,3,5"
  const commaMatch = cleaned.match(/^[\d,]+$/);
  if (commaMatch) {
    return cleaned.split(',').map(x => parseInt(x)).filter(x => !isNaN(x));
  }

  return [];
}

/**
 * 根据节次获取时间
 */
function getSlotTime(slot) {
  const times = {
    1:  { start: '08:00', end: '08:45' },
    2:  { start: '08:50', end: '09:35' },
    3:  { start: '09:50', end: '10:35' },
    4:  { start: '10:40', end: '11:25' },
    5:  { start: '11:30', end: '12:15' },
    6:  { start: '14:00', end: '14:45' },
    7:  { start: '14:50', end: '15:35' },
    8:  { start: '15:50', end: '16:35' },
    9:  { start: '16:40', end: '17:25' },
    10: { start: '17:30', end: '18:15' },
    11: { start: '19:00', end: '19:45' },
    12: { start: '19:50', end: '20:35' },
    13: { start: '20:40', end: '21:25' }
  };
  return times[slot] || { start: '00:00', end: '00:00' };
}

/**
 * 将课表存入数据库（全量替换）
 */
function saveCoursesToDB(courses) {
  const db = getDB();

  // 全量替换
  db.run('DELETE FROM courses');

  const sql = `INSERT INTO courses (week, day, name, teacher, location, start_slot, end_slot, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const c of courses) {
    db.run(sql, [c.week, c.day, c.name, c.teacher, c.location, c.start_slot, c.end_slot, c.start_time, c.end_time]);
  }

  console.log(`[NJUST] 已导入 ${courses.length} 条课程记录`);
}

/**
 * 将成绩存入数据库，返回新出现的成绩
 */
function saveScoresToDB(scores) {
  const db = getDB();
  const newScores = [];

  for (const s of scores) {
    const existing = db.prepare(
      'SELECT id FROM scores WHERE course_name = ? AND semester = ? AND exam_type = ?'
    ).get(s.course_name, s.semester, s.exam_type);

    if (!existing) {
      db.run(
        'INSERT INTO scores (course_name, score, credit, semester, exam_type) VALUES (?, ?, ?, ?, ?)',
        [s.course_name, s.score, s.credit, s.semester, s.exam_type]
      );
      newScores.push(s);

      // 推送新成绩通知
      const id = uuidv4();
      const scoreStr = typeof s.score === 'number' ? s.score.toFixed(1) : s.score;
      db.run(
        `INSERT INTO push_messages (id, type, title, body, payload) VALUES (?, 'score_update', ?, ?, ?)`,
        [id, `📊 新成绩: ${s.course_name}`, `${s.course_name}: ${scoreStr} 分`, JSON.stringify(s)]
      );
    }
  }

  if (newScores.length > 0) {
    console.log(`[NJUST] 新成绩 ${newScores.length} 条，已推送通知`);
  }

  return newScores;
}

module.exports = { login, fetchSchedule, fetchScores, fetchExams, getCurrentSemester };
