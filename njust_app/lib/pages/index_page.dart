import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_service.dart';
import '../models/models.dart';
import 'settings_page.dart';
import 'exams_page.dart';

class IndexPage extends StatefulWidget {
  const IndexPage({super.key});

  @override
  State<IndexPage> createState() => _IndexPageState();
}

class _IndexPageState extends State<IndexPage> {
  final _api = ApiService();
  bool _loading = true;
  String _dateStr = '';
  int _week = 1;
  int _maxWeek = 20;
  String _semester = '';
  List<Course> _todayCourses = [];
  int _scoreCount = 0;
  int _examCount = 0;
  int _scheduleCount = 0;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  void _formatDate() {
    final now = DateTime.now();
    final info = SemesterUtils.getCurrentWeekInfo();
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final dayIdx = now.weekday - 1;
    _dateStr =
        '${now.year}/${now.month}/${now.day} ${dayNames[dayIdx.clamp(0, 6)]}';
    _week = info.week;
    _maxWeek = info.maxWeek;
    _semester = info.semester;
  }

  Future<void> _loadDashboard() async {
    _formatDate();
    setState(() => _loading = true);

    // 读缓存
    try {
      final cachedSchedule = await _readCache('schedule_$_week');
      if (cachedSchedule != null && cachedSchedule['courses'] != null) {
        final courses = (cachedSchedule['courses'] as List)
            .map((c) => Course.fromJson(c))
            .toList();
        final dbDay = DateTime.now().weekday == 7 ? 7 : DateTime.now().weekday;
        _todayCourses = courses.where((c) => c.day == dbDay).toList();
        _scheduleCount = courses.length;
      }
    } catch (_) {}

    try {
      final cachedScores = await _readCache('scores');
      if (cachedScores != null && cachedScores['scores'] != null) {
        _scoreCount = (cachedScores['scores'] as List).length;
      }
    } catch (_) {}

    try {
      final cachedExams = await _readCache('exams');
      if (cachedExams != null && cachedExams['exams'] != null) {
        _examCount = (cachedExams['exams'] as List).length;
      }
    } catch (_) {}

    setState(() {});

    // 网络更新
    try {
      final schedData = await _api.getSchedule(_week);
      final courses =
          (schedData['courses'] as List? ?? []).map((c) => Course.fromJson(c)).toList();
      final dbDay = DateTime.now().weekday == 7 ? 7 : DateTime.now().weekday;
      _todayCourses = courses.where((c) => c.day == dbDay).toList();
      _scheduleCount = courses.length;
      setState(() {});
    } catch (_) {}

    try {
      final scoresData = await _api.getScores();
      final s = scoresData['scores'];
      _scoreCount = s is List ? s.length : 0;
      setState(() {});
    } catch (_) {}

    try {
      final examsData = await _api.getExams();
      final e = examsData['exams'];
      _examCount = e is List ? e.length : 0;
      setState(() {});
    } catch (_) {}

    setState(() => _loading = false);
  }

  Future<Map<String, dynamic>?> _readCache(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('njust_cache_$key');
      if (raw == null) return null;
      return jsonDecode(raw)['data'];
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('南理工课表助手'),
        actions: [
          IconButton(
            icon: Icon(Icons.settings),
            onPressed: () =>
                Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadDashboard,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 日期/周信息
            _buildHeader(),
            const SizedBox(height: 16),
            // 概览卡片
            _buildSummaryCards(),
            const SizedBox(height: 20),
            // 今日课程
            _buildTodayCourses(),
            const SizedBox(height: 16),
            // 快捷入口
            _buildQuickActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_dateStr,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF7C4DFF).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('第 $_week / $_maxWeek 周',
                    style: const TextStyle(color: Color(0xFF7C4DFF), fontSize: 13)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(_semester, style: TextStyle(color: Colors.grey[400], fontSize: 13)),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(
                _api.connected ? Icons.check_circle : Icons.error,
                size: 14,
                color: _api.connected ? Colors.green : Colors.red,
              ),
              const SizedBox(width: 4),
              Text(
                _api.connected ? '服务器已连接' : '未连上服务器',
                style: TextStyle(
                    color: _api.connected ? Colors.green : Colors.red, fontSize: 12),
              ),
              const Spacer(),
              if (_loading)
                const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCards() {
    return Row(
      children: [
        Expanded(
          child: _buildSummaryCard('📝 考试', '$_examCount', () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const ExamsPage()));
          }),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildSummaryCard('📊 成绩', '$_scoreCount', () {}),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildSummaryCard(
              '📅 课程', _scheduleCount > 0 ? '$_scheduleCount' : '--', () {}),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(String label, String num, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(num,
                style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF7C4DFF))),
            const SizedBox(height: 4),
            Text(label,
                style: TextStyle(color: Colors.grey[400], fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Widget _buildTodayCourses() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('📖 今日课程',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        if (_todayCourses.isEmpty && !_loading)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              children: [
                Text('🎉', style: TextStyle(fontSize: 40)),
                SizedBox(height: 8),
                Text('今天没有课~', style: TextStyle(color: Colors.grey)),
              ],
            ),
          ),
        ..._todayCourses.map((c) => _buildCourseCard(c)),
      ],
    );
  }

  Widget _buildCourseCard(Course c) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF7C4DFF).withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF7C4DFF),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.name,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w600)),
                if (c.location != null)
                  Text(c.location!,
                      style: TextStyle(color: Colors.grey[400], fontSize: 13)),
              ],
            ),
          ),
          Text(
            '${c.startTime ?? '第${c.startSlot}节'}',
            style: TextStyle(color: Colors.grey[400], fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Row(
      children: [
        Expanded(
          child: _buildActionBtn('📅 完整课表', Icons.calendar_month, () {
            // 切换到课表tab
          }),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildActionBtn('📊 成绩', Icons.assessment, () {}),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildActionBtn('📝 考试', Icons.quiz, () {
            Navigator.push(context,
                MaterialPageRoute(builder: (_) => const ExamsPage()));
          }),
        ),
      ],
    );
  }

  Widget _buildActionBtn(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Icon(icon, color: const Color(0xFF7C4DFF), size: 24),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(color: Colors.grey[300], fontSize: 12)),
          ],
        ),
      ),
    );
  }
}


