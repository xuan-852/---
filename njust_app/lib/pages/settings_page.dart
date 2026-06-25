import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _api = ApiService();
  final _idController = TextEditingController();
  final _pwdController = TextEditingController();
  bool _bound = false;
  String _username = '';
  bool _binding = false;
  bool _loadingStatus = true;
  bool _refreshing = false;
  bool _showPwd = false;
  String _serverUrl = '';
  String _statusError = '';

  @override
  void initState() {
    super.initState();
    _serverUrl = _api.serverUrl;
    _checkStatus();
  }

  @override
  void dispose() {
    _idController.dispose();
    _pwdController.dispose();
    super.dispose();
  }

  Future<void> _checkStatus() async {
    setState(() => _loadingStatus = true);
    try {
      final status = await _api.getUserStatus();
      if (status['user'] != null) {
        final user = status['user'] as Map<String, dynamic>;
        setState(() {
          _bound = true;
          _username = user['username'] as String? ?? '';
          _idController.text = _username;
          _loadingStatus = false;
        });
        return;
      }
    } catch (_) {}
    setState(() {
      _bound = false;
      _loadingStatus = false;
    });
  }

  Future<void> _bind() async {
    if (_idController.text.isEmpty || _pwdController.text.isEmpty) return;
    setState(() => _binding = true);
    try {
      await _api.bindAccount(_idController.text, _pwdController.text);
      setState(() {
        _bound = true;
        _username = _idController.text;
        _binding = false;
        _statusError = '';
      });
    } catch (e) {
      setState(() {
        _binding = false;
        _statusError = '绑定失败: $e';
      });
    }
  }

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    try {
      await _api.refreshData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('刷新成功'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('刷新失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
    setState(() => _refreshing = false);
  }

  Future<void> _saveServerUrl() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('server_url', _serverUrl);
      _api.serverUrl = _serverUrl;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('服务器地址已保存'), backgroundColor: Colors.green),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 服务器配置
          _buildSectionTitle('服务器配置'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                TextField(
                  decoration: const InputDecoration(
                    labelText: '服务器地址',
                    hintText: 'https://...',
                    prefixIcon: Icon(Icons.link),
                  ),
                  style: const TextStyle(color: Colors.white),
                  controller: TextEditingController.fromValue(
                    TextEditingValue(text: _serverUrl),
                  ),
                  onChanged: (v) => _serverUrl = v,
                  onSubmitted: (_) => _saveServerUrl(),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _saveServerUrl,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7C4DFF),
                    ),
                    child: const Text('保存'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 账号绑定
          _buildSectionTitle('账号绑定'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: _loadingStatus
                ? const Center(child: CircularProgressIndicator())
                : _bound
                    ? Column(
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.check_circle, color: Colors.green),
                              SizedBox(width: 8),
                              Text('已绑定',
                                  style: TextStyle(
                                      color: Colors.green, fontSize: 16)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text('学号: $_username',
                              style: const TextStyle(fontSize: 14)),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _refreshing ? null : _refresh,
                              icon: _refreshing
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    )
                                  : const Icon(Icons.refresh),
                              label: Text(_refreshing ? '刷新中...' : '刷新数据'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF4DFF88)
                                    .withOpacity(0.2),
                                foregroundColor: const Color(0xFF4DFF88),
                              ),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        children: [
                          TextField(
                            controller: _idController,
                            decoration: const InputDecoration(
                              labelText: '学号',
                              prefixIcon: Icon(Icons.person),
                            ),
                            style: const TextStyle(color: Colors.white),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _pwdController,
                            obscureText: !_showPwd,
                            decoration: InputDecoration(
                              labelText: '密码',
                              prefixIcon: const Icon(Icons.lock),
                              suffixIcon: IconButton(
                                icon: Icon(_showPwd
                                    ? Icons.visibility
                                    : Icons.visibility_off),
                                onPressed: () =>
                                    setState(() => _showPwd = !_showPwd),
                              ),
                            ),
                            style: const TextStyle(color: Colors.white),
                          ),
                          const SizedBox(height: 12),
                          if (_statusError.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text(_statusError,
                                  style: const TextStyle(
                                      color: Colors.red, fontSize: 12)),
                            ),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _binding ? null : _bind,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF7C4DFF),
                              ),
                              child: _binding
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    )
                                  : const Text('绑定'),
                            ),
                          ),
                        ],
                      ),
          ),
          const SizedBox(height: 20),

          // 连接状态
          _buildSectionTitle('连接状态'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(
                  _api.connected ? Icons.check_circle : Icons.error,
                  color: _api.connected ? Colors.green : Colors.red,
                ),
                const SizedBox(width: 8),
                Text(
                  _api.connected ? '服务器已连接' : '服务器未连接',
                  style: TextStyle(
                    color: _api.connected ? Colors.green : Colors.red,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () async {
                    final ok = await _api.checkConnection();
                    if (mounted) {
                      setState(() {});
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content:
                              Text(ok ? '连接正常' : '无法连接服务器'),
                          backgroundColor: ok ? Colors.green : Colors.red,
                        ),
                      );
                    }
                  },
                  child: const Text('检测'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 关于
          _buildSectionTitle('关于'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('南理工课表助手', style: TextStyle(fontSize: 16)),
                SizedBox(height: 4),
                Text('v1.0.0', style: TextStyle(color: Colors.grey, fontSize: 13)),
                SizedBox(height: 4),
                Text('Flutter APK 版',
                    style: TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
          style: const TextStyle(
              fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF7C4DFF))),
    );
  }
}
