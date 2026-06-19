// 周课表
const api = require('../../utils/api');
const { getCurrentWeekInfo } = require('../../utils/constants');

Page({
  data: {
    currentWeek: 1,
    maxWeek: 20,
    semester: '',
    days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    scheduleData: {},
    connected: true,
    hasCache: false
  },

  onLoad() {
    const info = getCurrentWeekInfo();
    const app = getApp();
    this.setData({ currentWeek: info.week, maxWeek: info.maxWeek, semester: info.semester, connected: app.globalData.connected });
    this.loadSchedule();
  },

  onShow() {
    const app = getApp();
    this.setData({ connected: app.globalData.connected });
  },

  async loadSchedule() {
    const week = this.data.currentWeek;

    // 先尝试读缓存
    try {
      const cached = wx.getStorageSync('njust_cache_schedule_' + week);
      if (cached && cached.data) {
        const scheduleData = this._buildSchedule(cached.data.courses || []);
        this.setData({ scheduleData, hasCache: true });
      }
    } catch (e) { /* ignore */ }

    // 网络请求更新
    try {
      const data = await api.getSchedule(week);
      const scheduleData = this._buildSchedule(data.courses || []);
      this.setData({
        scheduleData,
        hasCache: true
      });
    } catch (e) {
      // 网络不通——不标记离线，缓存已在上面预加载
      if (!this.data.hasCache) {
        console.error('加载课表失败:', e);
      }
    }
  },

  _buildSchedule(courses) {
    const scheduleData = {};
    for (const course of courses) {
      const day = course.day;
      if (!scheduleData[day]) scheduleData[day] = [];
      scheduleData[day].push(course);
    }
    return scheduleData;
  },

  prevWeek() {
    if (this.data.currentWeek > 1) {
      this.setData({ currentWeek: this.data.currentWeek - 1 });
      this.loadSchedule();
    }
  },

  nextWeek() {
    if (this.data.currentWeek < this.data.maxWeek) {
      this.setData({ currentWeek: this.data.currentWeek + 1 });
      this.loadSchedule();
    }
  }
});
