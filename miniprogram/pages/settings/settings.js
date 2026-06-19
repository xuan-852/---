const api = require('../../utils/api');

Page({
  data: {
    studentId: '',
    password: '',
    showPwd: false,
    binding: false,
    bound: false,
    username: '',
    loadingStatus: true,
    refreshing: false,
    connected: true
  },

  onShow() {
    this.checkStatus();
    // 设置页做健康检查（仅用于诊断显示，不修改全局状态）
    api.checkConnection().then((connected) => {
      this.setData({ connected });
    });
  },

  async checkStatus() {
    this.setData({ loadingStatus: true });
    try {
      const status = await api.getUserStatus();
      if (status && status.user) {
        this.setData({
          bound: true,
          username: status.user.username || '',
          studentId: status.user.username || '',
          loadingStatus: false
        });
      } else {
        this.setData({ bound: false, loadingStatus: false });
      }
    } catch (e) {
      this.setData({ bound: false, loadingStatus: false });
    }
  },

  onIdInput(e) {
    this.setData({ studentId: e.detail.value });
  },

  onPwdInput(e) {
    this.setData({ password: e.detail.value });
  },

  togglePwd() {
    this.setData({ showPwd: !this.data.showPwd });
  },

  async onBind() {
    const { studentId, password } = this.data;
    if (!studentId || !password) return;

    this.setData({ binding: true });
    try {
      await api.bindAccount(studentId, password);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.checkStatus();

      // 绑定成功后异步刷新数据（不阻塞，后台执行）
      api.refreshData().then(() => {
        wx.showToast({ title: '数据已同步', icon: 'success' });
      }).catch(() => {
        // 刷新失败不影响绑定状态，静默处理
        console.log('[settings] 后台刷新未完成（稍后自动重试）');
      });
    } catch (e) {
      wx.showToast({ title: '绑定失败: ' + e.message, icon: 'none' });
    }
    this.setData({ binding: false, password: '' });
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    try {
      await api.refreshData();
      wx.showToast({ title: '数据刷新成功', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '刷新失败: ' + e.message, icon: 'none' });
    }
    this.setData({ refreshing: false });
  }
});
