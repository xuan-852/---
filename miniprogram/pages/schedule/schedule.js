// 课表 — 整周网格视图 + 左右滑动切换周
const api = require('../../utils/api');
const { getCurrentWeekInfo } = require('../../utils/constants');

// DB day: 教务系统用 0=周日, 1..6=周一..周六
// 归一化为 1..7（1=周一, 7=周日）
function _normalizeDay(day) {
  return day === 0 ? 7 : day;
}

const _DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日'];
const _SLOT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const _SLOT_TIMES = ['08:00', '08:50', '09:50', '10:40', '11:30', '14:00', '14:50', '15:50', '16:40', '18:30', '19:20', '20:10'];

// 课程颜色（按 name hash 分配）
const _COLORS = [
  { bg: '#1a2a4e', border: '#4d7cff', text: '#8ab4ff' },
  { bg: '#2a1a3e', border: '#b388ff', text: '#d4a0ff' },
  { bg: '#1a3e2a', border: '#4dff88', text: '#80e8a0' },
  { bg: '#3e2a1a', border: '#ff884d', text: '#ffb080' },
  { bg: '#3e1a1a', border: '#ff4d6d', text: '#ff8098' },
  { bg: '#1a3e3e', border: '#4dd4ff', text: '#80e0ff' },
  { bg: '#2a2a1a', border: '#d4d44d', text: '#e8e080' },
];

function _hashColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return _COLORS[h % _COLORS.length];
}

const HEADER_H = 44;
const ROW_H = 78;

Page({
  data: {
    currentWeek: 1,
    maxWeek: 20,
    semester: '',
    days: _DAY_LABELS,
    slots: _SLOT_LABELS,
    slotTimes: _SLOT_TIMES,
    // 网格布局参数（由 _calcLayout 计算）
    timeColW: 70,
    colW: 97,
    gridH: 980,
    // { courseName, day, left, top, width, height, bg, border, textColor, location }
    cards: [],
    connected: true,
    hasCache: false,
  },

  onLoad() {
    this._calcLayout();
    const info = getCurrentWeekInfo();
    const app = getApp();
    this.setData({
      currentWeek: info.week, maxWeek: info.maxWeek, semester: info.semester,
      connected: app.globalData.connected
    });
    this.loadSchedule();
  },

  onShow() {
    this.setData({ connected: getApp().globalData.connected });
  },

  /** 根据屏幕尺寸计算列宽等布局参数 */
  _calcLayout() {
    try {
      const sys = wx.getSystemInfoSync();
      // rpx = 750 / screenWidth * px
      const ratio = 750 / sys.windowWidth;
      // container padding: 12rpx 两侧, grid border: 1rpx 两侧
      const gridW = 750 - 24 - 2; // = 724
      const timeColW = 70;
      const colW = Math.floor((gridW - timeColW) / 7); // ≈ 93
      const gridH = HEADER_H + 12 * ROW_H; // = 980
      this._timeColW = timeColW;
      this._colW = colW;
      this.setData({ timeColW, colW, gridH });
    } catch (e) {
      this._timeColW = 70;
      this._colW = 97;
    }
  },

  async loadSchedule() {
    const week = this.data.currentWeek;
    let fromCache = false;

    try {
      const cached = wx.getStorageSync('njust_cache_schedule_' + week);
      if (cached && cached.data) {
        this.setData({ cards: this._buildCards(cached.data.courses || []), hasCache: true });
        fromCache = true;
      }
    } catch (e) {}

    try {
      const data = await api.getSchedule(week);
      this.setData({ cards: this._buildCards(data.courses || []), hasCache: true });
    } catch (e) {
      if (!fromCache) console.error('加载课表失败:', e);
    }
  },

  /** 将课程列表转成绝对定位卡片数组 */
  _buildCards(courses) {
    const cw = this._colW || 97;
    const tcw = this._timeColW || 70;
    const cards = [];
    for (const c of courses) {
      const clr = _hashColor(c.name || '');
      const start = c.start_slot || 1;
      const end = c.end_slot || (start + 1);
      const top = HEADER_H + (start - 1) * ROW_H + 2;
      const height = (end - start + 1) * ROW_H - 4;
      const day = _normalizeDay(c.day);
      const left = tcw + (day - 1) * cw + 2;
      const width = cw - 4;
      cards.push({
        id: c.id || Math.random().toString(36).slice(2, 8),
        name: c.name || '',
        location: c.location || '',
        left, top, width, height,
        bg: clr.bg, border: clr.border, textColor: clr.text,
      });
    }
    return cards;
  },

  // ─── 触摸滑动切换周 ───
  onTouchStart(e) {
    this._touchX = e.touches[0].clientX;
    this._touchY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this._touchX;
    const dy = e.changedTouches[0].clientY - this._touchY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) this.prevWeek();
      else this.nextWeek();
    }
  },

  prevWeek() {
    if (this.data.currentWeek > 1) {
      this.setData({ currentWeek: this.data.currentWeek - 1 }, () => this.loadSchedule());
    } else {
      wx.showToast({ title: '已是第一周', icon: 'none' });
    }
  },

  nextWeek() {
    if (this.data.currentWeek < this.data.maxWeek) {
      this.setData({ currentWeek: this.data.currentWeek + 1 }, () => this.loadSchedule());
    } else {
      wx.showToast({ title: '已是最后一周', icon: 'none' });
    }
  }
});
