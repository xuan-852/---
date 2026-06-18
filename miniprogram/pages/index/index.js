// 首页 - 今日课表
const api = require('../../utils/api');

Page({
  data: {
    todayCourses: [],
    dateStr: '',
    week: 1
  },

  onLoad() {
    this.updateDate();
    this.loadTodaySchedule();
  },

  onShow() {
    this.loadTodaySchedule();
  },

  updateDate() {
    const now = new Date();
    const week = this.getCurrentWeek();
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    this.setData({
      dateStr: `${now.getMonth() + 1}/${now.getDate()} ${dayNames[now.getDay() === 0 ? 6 : now.getDay() - 1]}`,
      week
    });
  },

  getCurrentWeek() {
    // TODO: 根据学期开始日期计算
    return 1;
  },

  async loadTodaySchedule() {
    try {
      const day = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
      const data = await api.getSchedule(this.data.week);
      const todayCourses = data.courses.filter(c => c.day === day);
      this.setData({ todayCourses });
    } catch (e) {
      console.error('加载课表失败:', e);
    }
  }
});
