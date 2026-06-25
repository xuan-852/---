import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/models.dart';
import '../services/theme_provider.dart';

class ScoresPage extends StatefulWidget {
  const ScoresPage({super.key});

  @override
  State<ScoresPage> createState() => _ScoresPageState();
}

class _ScoresPageState extends State<ScoresPage> {
  final _api = ApiService();
  List<SemesterGroup> _semesters = [];
  bool _loading = true;
  double _totalGpa = 0;
  int _totalCredits = 0;

  @override
  void initState() {
    super.initState();
    _loadScores();
  }

  Future<void> _loadScores() async {
    setState(() => _loading = true);
    try {
      final data = await _api.getScores();
      _processData(data);
    } catch (_) {
      // Offline, try cache
    }
    setState(() => _loading = false);
  }

  void _processData(Map<String, dynamic> data) {
    final allScores = (data['scores'] as List? ?? [])
        .map((s) => Score.fromJson(s))
        .toList();

    // 按学期分组
    final groups = <String, List<Score>>{};
    for (final s in allScores) {
      groups.putIfAbsent(s.semester, () => []).add(s);
    }

    _semesters = groups.entries.map((e) {
      final numeric = e.value.where((s) => _parseNumericScore(s.score) != null).toList();
      double totalGp = 0;
      int totalC = 0;
      for (final s in numeric) {
        totalGp += s.gpaPoint * s.credit;
        totalC += s.credit.toInt();
      }
      return SemesterGroup(
        semester: e.key,
        scores: e.value,
        gpa: totalC > 0 ? (totalGp / totalC) : 0,
        totalCredits: totalC,
      );
    }).toList()
      ..sort((a, b) => b.semester.compareTo(a.semester));

    // 总 GPA
    final allNumeric = allScores.where((s) => _parseNumericScore(s.score) != null).toList();
    double totalGP = 0;
    int totalC = 0;
    for (final s in allNumeric) {
      totalGP += s.gpaPoint * s.credit;
      totalC += s.credit.toInt();
    }
    _totalGpa = totalC > 0 ? totalGP / totalC : 0;
    _totalCredits = totalC;

    if (_semesters.isNotEmpty) _semesters[0].expanded = true;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('成绩')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadScores,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // 总 GPA 卡片
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF7C4DFF), Color(0xFF4D7CFF)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        const Text('总 GPA（4.0 制）',
                            style: TextStyle(
                                fontSize: 14, color: Colors.white70)),
                        const SizedBox(height: 8),
                        Text(_totalGpa.toStringAsFixed(2),
                            style: const TextStyle(
                                fontSize: 42,
                                fontWeight: FontWeight.bold,
                                color: Colors.white)),
                        const SizedBox(height: 4),
                        Text('总学分: $_totalCredits',
                            style: const TextStyle(
                                fontSize: 13, color: Colors.white70)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  // 各学期
                  ..._semesters.map((sg) => _buildSemesterCard(sg)),
                ],
              ),
            ),
    );
  }

  Widget _buildSemesterCard(SemesterGroup sg) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: ThemeProvider().cardBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => sg.expanded = !sg.expanded),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(sg.semester,
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 15, color: ThemeProvider().primaryText)),
                        const SizedBox(height: 4),
                        Text('${sg.scores.length}门课 · GPA ${sg.gpa.toStringAsFixed(2)}',
                            style: TextStyle(
                                color: ThemeProvider().secondaryText, fontSize: 13)),
                      ],
                    ),
                  ),
                  Icon(
                    sg.expanded ? Icons.expand_less : Icons.expand_more,
                    color: ThemeProvider().secondaryText,
                  ),
                ],
              ),
            ),
          ),
          if (sg.expanded)
            ...sg.scores.map((s) => _buildScoreItem(s)),
        ],
      ),
    );
  }

  double? _parseNumericScore(String score) {
    final val = double.tryParse(score);
    if (val != null) return val;
    const map = {
      '优': 90, '优-': 87, '良+': 83, '良': 80, '良-': 76,
      '中+': 73, '中': 70, '中-': 66, '及格': 60, '不及格': 0,
    };
    return map[score.trim()]?.toDouble();
  }

  Widget _buildScoreItem(Score s) {
    final scoreVal = _parseNumericScore(s.score);
    Color scoreColor;
    if (scoreVal == null) {
      scoreColor = Colors.grey;
    } else if (scoreVal >= 90) {
      scoreColor = Colors.green;
    } else if (scoreVal >= 80) {
      scoreColor = Colors.lightGreen;
    } else if (scoreVal >= 70) {
      scoreColor = Colors.orange;
    } else if (scoreVal >= 60) {
      scoreColor = Colors.deepOrange;
    } else {
      scoreColor = Colors.red;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: ThemeProvider().border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.name, style: TextStyle(fontSize: 14, color: scoreColor.withOpacity(0.75))),
                Text('${s.credit.toStringAsFixed(0)}学分  ${s.scoreType ?? ''}',
                    style: TextStyle(color: ThemeProvider().secondaryText, fontSize: 12)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: scoreColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              double.tryParse(s.score) == null && scoreVal != null
                  ? '${s.score} (${scoreVal.toInt()})'
                  : s.score,
              style: TextStyle(
                color: scoreColor,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            s.gpaPoint.toStringAsFixed(1),
            style: TextStyle(color: ThemeProvider().secondaryText, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class SemesterGroup {
  final String semester;
  final List<Score> scores;
  final double gpa;
  final int totalCredits;
  bool expanded;

  SemesterGroup({
    required this.semester,
    required this.scores,
    required this.gpa,
    required this.totalCredits,
    this.expanded = false,
  });
}
