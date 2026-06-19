// 首页 - 仪表盘
const api = require('../../utils/api');
const { getCurrentWeekInfo } = require('../../utils/constants');

Page({
  data: {
    dateStr: '',
    week: 1,
    maxWeek: 20,
    semester: '',
    todayCourses: [],
    loading: true,
    hasCache: false,
    connected: true, // 乐观默认，避免闪烁
    errorMsg: '',
    // 统计
    scoreCount: 0,
    scheduleCount: 0,
    examCount: 0,
    lastUpdate: null
  },

  onShow() {
    this.loadDashboard();
  },

  /** 格式化日期 */
  formatDate() {
    const now = new Date();
    const info = getCurrentWeekInfo();
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return {
      dateStr: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${dayNames[now.getDay() === 0 ? 6 : now.getDay() - 1]}`,
      week: info.week,
      maxWeek: info.maxWeek,
      semester: info.semester
    };
  },

  async loadDashboard() {
    const app = getApp();
    const { dateStr, week, maxWeek, semester } = this.formatDate();
    this.setData({ dateStr, week, maxWeek, semester, loading: true, errorMsg: '', connected: app.globalData.connected });

    // 1. 检查缓存预加载——不管网络如何，保证有旧数据显示
    let todayCourses = [];
    let scoreCount = 0;
    let examCount = 0;
    let scheduleCount = 0;
    let hasCache = false;

    try {
      const cachedSchedule = wx.getStorageSync('njust_cache_schedule_' + week);
      if (cachedSchedule && cachedSchedule.data) {
        const day = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
        todayCourses = (cachedSchedule.data.courses || []).filter(c => c.day === day);
        scheduleCount = cachedSchedule.data.courses ? cachedSchedule.data.courses.length : 0;
        hasCache = true;
      }
    } catch (e) { /* ignore */ }

    try {
      const cachedScores = wx.getStorageSync('njust_cache_scores');
      if (cachedScores && cachedScores.data) {
        scoreCount = (cachedScores.data.scores || []).length;
        hasCache = true;
      }
    } catch (e) { /* ignore */ }

    try {
      const cachedExams = wx.getStorageSync('njust_cache_exams');
      if (cachedExams && cachedExams.data) {
        examCount = cachedExams.data.exams ? cachedExams.data.exams.length : 0;
        hasCache = true;
      }
    } catch (e) { /* ignore */ }

    this.setData({ todayCourses, scoreCount, examCount, scheduleCount, hasCache });

    // 2. 尝试网络请求更新（失败不标记离线，静默回退到缓存）
    try {
      const status = await api.getUserStatus();
      if (status && status.user) {
        this.setData({ lastUpdate: status.user.last_login_at || null });
      }
    } catch (e) {
      // 网络不通——不影响 connected 状态，保留缓存数据
    }

    // 3. 尝试网络更新（每个接口独立容错，单个失败不影响其他）
    try {
      const schedData = await api.getSchedule(week);
      const day = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
      todayCourses = (schedData.courses || []).filter(c => c.day === day);
      scheduleCount = schedData.courses ? schedData.courses.length : 0;
    } catch (e) { /* 课表接口失败 — 继续使用缓存 */ }
    try {
      const scoreData = await api.getScores();
      scoreCount = (scoreData.scores || []).length;
    } catch (e) { /* 成绩接口失败 — 继续使用缓存 */ }
    try {
      const examData = await api.getExams();
      if (examData && examData.exams) examCount = examData.exams.length;
    } catch (e) { /* 考试接口失败 — 继续使用缓存 */ }

    this.setData({
      todayCourses,
      week,
      maxWeek,
      semester,
      scoreCount,
      scheduleCount,
      examCount,
      hasCache,
      connected: app.globalData.connected,
      loading: false
    });
  },

  /** 手动刷新 */
  async onRefresh() {
    wx.showToast({ title: '正在刷新...', icon: 'loading' });
    try {
      await api.refreshData();
      wx.showToast({ title: '刷新成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '刷新失败(离线)', icon: 'none' });
    }
    this.loadDashboard();
  },

  /** 页面跳转 */
  tapNav(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  }
});
