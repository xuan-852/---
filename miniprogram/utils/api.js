const app = getApp();

// ─── 连接状态管理（滑动窗口 + 两阶段探测） ───
//
// 阶段 1 - 初始探测：模块加载时 5s 内快速发 10 次 ping
//   ≥ 8 次成功 → 标记已连接；否则保持未连接
// 阶段 2 - 稳态心跳：每 5s 一次 ping，滑动窗口保留最近 6 次结果
//   已连接时：窗口内 < 5 次成功 → 断连
//   未连接时：窗口内 ≥ 5 次成功 → 恢复
//
let _heartbeatTimer = null;
let _initialized = false;             // 阶段 1 是否完成

const _HEARTBEAT_MS = 5000;           // 稳态：5s 一次心跳
const _WINDOW_SIZE = 6;               // 滑动窗口大小（覆盖 30s）
const _CONNECTED_THRESHOLD = 5;       // 已连接：窗口 ≥5 次成功才维持
const _DISCONNECTED_THRESHOLD = 5;    // 已断连：窗口 ≥5 次成功才恢复

const _INIT_PROBES = 10;              // 初始探测：10 次
const _INIT_WINDOW_MS = 5000;         // 初始窗口：5s
const _INIT_THRESHOLD = 8;            // 初始：≥8 次成功标记已连接

/** 环形缓冲区，保留最近 _WINDOW_SIZE 次 ping 结果（true=成功） */
let _pingWindow = [];

function _pushPing(ok) {
  _pingWindow.push(ok);
  if (_pingWindow.length > _WINDOW_SIZE) _pingWindow.shift();
}
function _windowSuccess() {
  return _pingWindow.filter(Boolean).length;
}

/** 根据滑动窗口判决连接状态（窗口未满则跳过） */
function _evaluateConnection() {
  if (_pingWindow.length < _WINDOW_SIZE) return;
  const wins = _windowSuccess();
  if (app.globalData.connected) {
    // 已连接 → 成功率不足则断连
    if (wins < _CONNECTED_THRESHOLD) {
      app.globalData.connected = false;
    }
  } else {
    // 未连接 → 成功率达标则恢复
    if (wins >= _DISCONNECTED_THRESHOLD) {
      app.globalData.connected = true;
    }
  }
}

function _doPing() {
  wx.request({
    url: app.globalData.serverUrl + '/api/ping',
    method: 'GET',
    timeout: 3000,
    success: () => {
      _pushPing(true);
      if (_initialized) _evaluateConnection();
    },
    fail: () => {
      _pushPing(false);
      if (_initialized) _evaluateConnection();
    }
  });
}

/** 阶段 1：5s 内发 10 次 ping，≥8 次成功才算已连接 */
function _initProbe() {
  app.globalData.connected = false;
  let successCount = 0;
  let doneCount = 0;

  for (let i = 0; i < _INIT_PROBES; i++) {
    setTimeout(() => {
      wx.request({
        url: app.globalData.serverUrl + '/api/ping',
        method: 'GET',
        timeout: 3000,
        success: () => {
          successCount++;
          _pushPing(true);
        },
        fail: () => {
          _pushPing(false);
        },
        complete: () => {
          doneCount++;
          if (doneCount === _INIT_PROBES) {
            _initialized = true;
            if (successCount >= _INIT_THRESHOLD) {
              app.globalData.connected = true;
            }
            // 进入阶段 2：稳态心跳
            _heartbeatTimer = setInterval(_doPing, _HEARTBEAT_MS);
          }
        }
      });
    }, i * (_INIT_WINDOW_MS / _INIT_PROBES)); // 每 500ms 发一次
  }
}

/** 成功的业务请求立即标记已连接（比心跳更实时） */
function _resetConnected() {
  _pushPing(true);                  // 喂一个成功进窗口
  if (_initialized) _evaluateConnection();
  app.globalData.connected = true;  // 即时标记
}

// 缓存 key 前缀
const CACHE_PREFIX = 'njust_cache_';
const CACHE_KEYS = {
  SCHEDULE: CACHE_PREFIX + 'schedule',
  SCORES: CACHE_PREFIX + 'scores',
  EXAMS: CACHE_PREFIX + 'exams',
  REMINDERS: CACHE_PREFIX + 'reminders',
  STATUS: CACHE_PREFIX + 'status'
};

/**
 * 带缓存回退的网络请求核心函数
 * 1. 优先网络请求（带超时）
 * 2. 成功 → 写缓存 + 标记 connected
 * 3. 失败 → 读缓存（有则静默返回，无则 reject）
 *
 * 注意：请求超时不代表服务器离线（可能是刷新等耗时操作），
 * 因此 fail 时不设置 connected=false，由专门的健康检查判定。
 */
function request(path, options = {}) {
  const url = app.globalData.serverUrl + path;
  const token = app.globalData.token;
  const cacheKey = options.cacheKey;
  const timeout = options.timeout || 15000; // 默认 15s，覆盖式传入

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      timeout,
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.status === 'ok') {
          _resetConnected();
          // 写缓存
          if (cacheKey) {
            try {
              wx.setStorageSync(cacheKey, {
                data: res.data.data,
                time: Date.now()
              });
            } catch (e) { /* 存储满忽略 */ }
          }
          resolve(res.data.data);
        } else {
          // 服务器返回错误（非网络问题）
          const msg = (res.data && res.data.message) || '请求失败';
          reject(new Error(msg));
        }
      },
      fail: (err) => {
        // 只读缓存，不修改 connected 状态（避免刷新超时误判离线）
        if (cacheKey) {
          try {
            const cached = wx.getStorageSync(cacheKey);
            if (cached && cached.data) {
              console.log('[缓存] 命中:', cacheKey);
              resolve(cached.data);
              return;
            }
          } catch (e) { /* 缓存不可用 */ }
        }
        const errMsg = (err && err.errMsg) || '请求失败';
        reject(new Error(errMsg));
      }
    });
  });
}

/**
 * 快速健康检查 — 仅用于设置页诊断
 * 默认先启动初始探测（如尚未完成），再单次 ping 实时查询
 */
function checkConnection() {
  if (!_initialized) _initProbe();
  return new Promise((resolve) => {
    wx.request({
      url: app.globalData.serverUrl + '/api/ping',
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        resolve(res.data && res.data.status === 'ok');
      },
      fail: () => resolve(false)
    });
  });
}

module.exports = {
  // ─── 用户 ───
  getUserStatus: () => request('/api/user/status', { cacheKey: CACHE_KEYS.STATUS }),

  bindAccount: (username, password) => request('/api/user/bind', {
    method: 'POST',
    data: { username, password }
  }),

  refreshData: () => request('/api/refresh', { method: 'POST', timeout: 120000 }),

  // ─── 课表（按周） ───
  getSchedule: (week) => request('/api/schedule', {
    data: { week },
    cacheKey: CACHE_KEYS.SCHEDULE + '_' + week
  }),

  // ─── 成绩 ───
  getScores: () => request('/api/scores', { cacheKey: CACHE_KEYS.SCORES }),

  // ─── 考试安排 ───
  getExams: () => request('/api/exams', { cacheKey: CACHE_KEYS.EXAMS }),

  // ─── 桌面便签 ───
  getReminders: () => request('/api/reminders', { cacheKey: CACHE_KEYS.REMINDERS }),

  // ─── 手动推送（测试用） ───
  pushMessage: (type, title, body) => request('/api/push', {
    method: 'POST',
    data: { type, title, body }
  }),

  // ─── 工具：获取连接状态 ───
  getConnectionStatus: () => app.globalData.connected,

  // ─── 工具：主动检测连接（健康检查） ───
  checkConnection,

  // ─── 工具：获取最后更新时间 ───
  getCachedTime: (cacheKey) => {
    try {
      const cached = wx.getStorageSync(cacheKey);
      return cached ? cached.time : null;
    } catch (e) { return null; }
  }
};

// 模块加载时自动开始初始探测
_initProbe();
