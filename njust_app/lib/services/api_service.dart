import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

/// 缓存键前缀
const String _cachePrefix = 'njust_cache_';

/// API 服务 — 单例，负责网络请求 + 缓存 + 连接管理
class ApiService {
  // ─── 单例 ───
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  // ─── 配置 ───
  String serverUrl = 'https://cross-churn-distance.ngrok-free.dev';
  String token = 'mini_secret_token_here';

  // ─── 连接状态 ───
  bool connected = true;

  // ─── 滑动窗口健康检查 ───
  static const int _windowSize = 8;
  static const int _connectedThreshold = 6;
  static const int _disconnectedThreshold = 5;
  final List<bool> _pingWindow = [];
  bool _initialized = false;

  void _pushPing(bool ok) {
    _pingWindow.add(ok);
    if (_pingWindow.length > _windowSize) _pingWindow.removeAt(0);
  }

  int get _windowSuccess => _pingWindow.where((b) => b).length;

  void _evaluateConnection() {
    if (_pingWindow.length < _windowSize) return;
    final wins = _windowSuccess;
    if (connected) {
      if (wins < _connectedThreshold) connected = false;
    } else {
      if (wins >= _disconnectedThreshold) connected = true;
    }
  }

  void _resetConnected() {
    _pushPing(true);
    if (_initialized) _evaluateConnection();
    connected = true;
  }

  /// 初始探测：并发 6 次 ping
  Future<void> initProbe() async {
    int successCount = 0;
    final saved = List<bool>.from(_pingWindow);

    final futures = List.generate(6, (_) async {
      try {
        final res = await http
            .get(Uri.parse('$serverUrl/api/ping'),
                headers: {'ngrok-skip-browser-warning': 'true'})
            .timeout(const Duration(seconds: 8));
        if (res.statusCode == 200) successCount++;
      } catch (_) {}
    });

    await Future.wait(futures);
    _initialized = true;
    _pingWindow
      ..clear()
      ..addAll(saved);
    if (successCount >= 4) {
      _pushPing(true);
      connected = true;
    }
    // 启动稳态心跳
    _startHeartbeat();
  }

  void _startHeartbeat() {
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 5));
      _doPing();
      return true;
    });
  }

  void _doPing() {
    http
        .get(Uri.parse('$serverUrl/api/ping'),
            headers: {'ngrok-skip-browser-warning': 'true'})
        .then((res) {
      _pushPing(true);
      if (_initialized) _evaluateConnection();
    }).catchError((_) {
      _pushPing(false);
      if (_initialized) _evaluateConnection();
    });
  }

  // ─── 缓存 ───
  Future<void> _writeCache(String key, dynamic data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      prefs.setString(
          _cachePrefix + key, jsonEncode({'data': data, 'time': DateTime.now().toIso8601String()}));
    } catch (_) {}
  }

  Future<dynamic> _readCache(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cachePrefix + key);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      return decoded['data'];
    } catch (_) {
      return null;
    }
  }

  // ─── 核心请求 ───
  Future<dynamic> request(String path,
      {String method = 'GET', Map<String, dynamic>? data, String? cacheKey, int timeout = 15000}) async {
    final uri = Uri.parse('$serverUrl$path');
    final headers = {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    };

    http.Response res;
    try {
      if (method == 'GET') {
        final realUri = data != null
            ? uri.replace(queryParameters: data.map((k, v) => MapEntry(k, '$v')))
            : uri;
        res = await http.get(realUri, headers: headers).timeout(Duration(milliseconds: timeout));
      } else if (method == 'POST') {
        res = await http
            .post(uri, headers: headers, body: data != null ? jsonEncode(data) : null)
            .timeout(Duration(milliseconds: timeout));
      } else if (method == 'PUT') {
        res = await http
            .put(uri, headers: headers, body: data != null ? jsonEncode(data) : null)
            .timeout(Duration(milliseconds: timeout));
      } else if (method == 'DELETE') {
        res = await http.delete(uri, headers: headers).timeout(Duration(milliseconds: timeout));
      } else {
        throw Exception('Unsupported method: $method');
      }

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        if (body['status'] == 'ok') {
          _resetConnected();
          if (cacheKey != null) {
            _writeCache(cacheKey, body['data']);
          }
          return body['data'];
        } else {
          throw Exception(body['message'] ?? '请求失败');
        }
      } else {
        throw Exception('HTTP ${res.statusCode}');
      }
    } catch (e) {
      // 网络失败 -> 尝试缓存
      if (cacheKey != null) {
        final cached = await _readCache(cacheKey);
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  // ─── API 封装 ───
  Future<Map<String, dynamic>> getUserStatus() =>
      request('/api/user/status').then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> bindAccount(String username, String password) async {
    // 清除旧状态缓存
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_cachePrefix + 'status');
    } catch (_) {}
    final d = await request('/api/user/bind', method: 'POST', data: {
      'username': username,
      'password': password,
    });
    return Map<String, dynamic>.from(d);
  }

  Future<Map<String, dynamic>> refreshData() =>
      request('/api/refresh', method: 'POST', timeout: 120000)
          .then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> getSchedule(int week) {
    final d = request('/api/schedule', data: {'week': week}, cacheKey: 'schedule_$week');
    return d.then((v) => Map<String, dynamic>.from(v));
  }

  Future<Map<String, dynamic>> getScores() =>
      request('/api/scores', cacheKey: 'scores').then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> getExams() =>
      request('/api/exams', cacheKey: 'exams').then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> getReminders({String? category}) {
    final params = <String, dynamic>{};
    if (category != null && category.isNotEmpty) params['category'] = category;
    return request('/api/reminders', data: params.isEmpty ? null : params, cacheKey: 'reminders')
        .then((d) => Map<String, dynamic>.from(d));
  }

  Future<Map<String, dynamic>> createReminder(Map<String, dynamic> data) =>
      request('/api/reminders', method: 'POST', data: data)
          .then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> updateReminder(int id, Map<String, dynamic> data) =>
      request('/api/reminders/$id', method: 'PUT', data: data)
          .then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> deleteReminder(int id) =>
      request('/api/reminders/$id', method: 'DELETE').then((d) => Map<String, dynamic>.from(d));

  Future<Map<String, dynamic>> toggleReminder(int id, bool done) =>
      request('/api/reminders/$id', method: 'PUT', data: {'done': done ? 1 : 0})
          .then((d) => Map<String, dynamic>.from(d));

  /// 健康检查
  Future<bool> checkConnection() async {
    if (!_initialized) await initProbe();
    if (_pingWindow.length >= _windowSize) {
      return _windowSuccess >= _connectedThreshold;
    }
    if (connected) return true;
    try {
      final res = await http
          .get(Uri.parse('$serverUrl/api/ping'),
              headers: {'ngrok-skip-browser-warning': 'true'})
          .timeout(const Duration(seconds: 8));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}

// ─── 学期工具 ───
class SemesterUtils {
  static final List<Map<String, dynamic>> semesters = [
    {'start': '2025-09-01', 'weeks': 20, 'label': '2025-2026-1'},
    {'start': '2026-02-23', 'weeks': 20, 'label': '2025-2026-2'},
    {'start': '2026-09-07', 'weeks': 20, 'label': '2026-2027-1'},
  ];

  static SemesterInfo getCurrentWeekInfo() {
    final now = DateTime.now();
    for (final s in semesters) {
      final start = DateTime.parse(s['start'] as String);
      final end = start.add(Duration(days: (s['weeks'] as int) * 7));
      if (now.isAfter(start) && now.isBefore(end)) {
        final diff = now.difference(start).inDays;
        final week = (diff / 7).ceil();
        return SemesterInfo(
          week: week.clamp(1, s['weeks'] as int),
          maxWeek: s['weeks'] as int,
          semester: s['label'] as String,
        );
      }
    }
    // 找最近学期
    var nearest = semesters[1];
    for (final s in semesters) {
      final start = DateTime.parse(s['start'] as String);
      if ((now.difference(start).inDays.abs()) <
          (now.difference(DateTime.parse(nearest['start'] as String)).inDays.abs())) {
        nearest = s;
      }
    }
    final start = DateTime.parse(nearest['start'] as String);
    final diff = now.difference(start).inDays;
    final week = (diff / 7).ceil();
    return SemesterInfo(
      week: week.clamp(1, nearest['weeks'] as int),
      maxWeek: nearest['weeks'] as int,
      semester: nearest['label'] as String,
    );
  }
}
