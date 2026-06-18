// 成绩页面
const api = require('../../utils/api');

Page({
  data: {
    scores: [],
    gpa: 0
  },

  onLoad() {
    this.loadScores();
  },

  async loadScores() {
    try {
      const data = await api.getScores();
      const scores = data.scores || [];
      const totalPoints = scores.reduce((sum, s) => sum + s.score * s.credit, 0);
      const totalCredits = scores.reduce((sum, s) => sum + s.credit, 0);
      this.setData({
        scores,
        gpa: totalCredits > 0 ? (totalPoints / totalCredits / 20).toFixed(2) : 0
      });
    } catch (e) {
      console.error('加载成绩失败:', e);
    }
  }
});
