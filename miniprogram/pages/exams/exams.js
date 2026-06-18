// 考试安排
const api = require('../../utils/api');

Page({
  data: {
    exams: []
  },

  onLoad() {
    this.loadExams();
  },

  async loadExams() {
    try {
      const data = await api.getExams();
      this.setData({ exams: data.exams || [] });
    } catch (e) {
      console.error('加载考试安排失败:', e);
    }
  }
});
