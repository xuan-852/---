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
    connected: true,
    serverUrl: '',
    statusError: '',
  },

  onShow() {
    const app = getApp();
    this.setData({
      connected: api.getConnectionStatus(),
      serverUrl: app.globalData.serverUrl,
    });
    this.checkStatus();
  },

  /** 检查绑定状态 — 优先用 api.getUserStatus，失败时降级到直连 */
  async checkStatus() {
    this.setData({ loadingStatus: true, statusError: '' });
    try {
      const status = await api.getUserStatus();
      if (status && status.user) {
        this.setData({
          bound: true,
          username: status.user.username || '',
          studentId: status.user.username || '',
          loadingStatus: false,
          statusError: '',
        });
        return;
      }
    } catch (e) {
      console.log('[settings] api.getUserStatus 失败，降级到直连:', e.message);
    }
    // 降级：直接用 wx.request 检查（手机端网络兼容性更好）
    this._rawCheckStatus();
  },

  /** 直连检查（绕过 api.request 封装，手机端更可靠） */
  _rawCheckStatus() {
    const app = getApp();
    const url = app.globalData.serverUrl + '/api/user/status';
    const token = app.globalData.token;
    console.log('[settings] 直连请求:', url, 'token:', token);
    wx.request({
      url: url,
      method: 'GET',
      timeout: 15000,
      header: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      success: (res) => {
        // 显示原始响应（诊断用）
        const raw = JSON.stringify(res.data || {});
        console.log('[settings] 直连响应:', raw, 'HTTP状态码:', res.statusCode);
        const data = (res.data && res.data.data) ? res.data.data : null;
        if (data && data.user) {
          this.setData({
            bound: true,
            username: data.user.username || '',
            studentId: data.user.username || '',
            loadingStatus: false,
            statusError: '原始响应: ' + raw.slice(0, 200),
          });
        } else {
          this.setData({
            bound: false,
            loadingStatus: false,
            statusError: '原始响应: ' + raw.slice(0, 200) + ' (HTTP ' + res.statusCode + ')',
          });
        }
      },
      fail: (err) => {
        console.log('[settings] 直连失败:', err.errMsg);
        this.setData({
          bound: false,
          loadingStatus: false,
          statusError: '连接失败: ' + ((err && err.errMsg) || '网络错误'),
        });
      }
    });
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
      this.setData({ password: '' });

      // 明确等待 checkStatus 完成再更新 UI
      await this.checkStatus();

      // 绑定成功后异步刷新数据（不阻塞，后台执行）
      api.refreshData().then(() => {
        wx.showToast({ title: '数据已同步', icon: 'success' });
      }).catch(() => {
        console.log('[settings] 后台刷新未完成（稍后自动重试）');
      });
    } catch (e) {
      wx.showToast({ title: '绑定失败: ' + e.message, icon: 'none' });
    }
    this.setData({ binding: false });
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
  },

  /** 手动检查服务器连接（清除缓存，重新请求） */
  onCheckConnection() {
    this.setData({ loadingStatus: true, statusError: '' });
    // 直接发请求，不走缓存
    const app = getApp();
    wx.request({
      url: app.globalData.serverUrl + '/api/user/status',
      method: 'GET',
      timeout: 15000,
      header: {
        'Authorization': 'Bearer ' + app.globalData.token,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      success: (res) => {
        if (res.data && res.data.status === 'ok' && res.data.data && res.data.data.user) {
          this.setData({
            bound: true,
            username: res.data.data.user.username || '',
            studentId: res.data.data.user.username || '',
            loadingStatus: false,
          });
          wx.showToast({ title: '已绑定: ' + res.data.data.user.username, icon: 'success' });
        } else {
          this.setData({
            bound: false,
            loadingStatus: false,
            statusError: '服务器返回未绑定状态',
          });
        }
      },
      fail: (err) => {
        this.setData({
          bound: false,
          loadingStatus: false,
          statusError: '服务器连接失败: ' + ((err && err.errMsg) || '网络错误'),
        });
      }
    });
  }
});
