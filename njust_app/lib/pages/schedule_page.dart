import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/models.dart';

const List<String> _dayLabels = ['', '一', '二', '三', '四', '五', '六', '日'];
const List<String> _slotLabels = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
];
const List<String> _slotTimes = [
  '08:00', '08:50', '09:50', '10:40', '11:30',
  '14:00', '14:50', '15:50', '16:40', '18:30', '19:20', '20:10'
];

const List<Map<String, Color>> _colors = [
  {'bg': Color(0xFF1A2A4E), 'border': Color(0xFF4D7CFF), 'text': Color(0xFF8AB4FF)},
  {'bg': Color(0xFF2A1A3E), 'border': Color(0xFFB388FF), 'text': Color(0xFFD4A0FF)},
  {'bg': Color(0xFF1A3E2A), 'border': Color(0xFF4DFF88), 'text': Color(0xFF80E8A0)},
  {'bg': Color(0xFF3E2A1A), 'border': Color(0xFFFF884D), 'text': Color(0xFFFFB080)},
  {'bg': Color(0xFF3E1A1A), 'border': Color(0xFFFF4D6D), 'text': Color(0xFFFF8098)},
  {'bg': Color(0xFF1A3E3E), 'border': Color(0xFF4DD4FF), 'text': Color(0xFF80E0FF)},
  {'bg': Color(0xFF2A2A1A), 'border': Color(0xFFD4D44D), 'text': Color(0xFFE8E080)},
];

Map<String, Color> _hashColor(String name) {
  int h = 0;
  for (final c in name.runes) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return _colors[h % _colors.length];
}

class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key});

  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> {
  final _api = ApiService();
  int _currentWeek = 1;
  int _maxWeek = 20;
  String _semester = '';
  List<Course> _courses = [];
  bool _loading = true;

  late PageController _pageController;

  @override
  void initState() {
    super.initState();
    final info = SemesterUtils.getCurrentWeekInfo();
    _currentWeek = info.week;
    _maxWeek = info.maxWeek;
    _semester = info.semester;
    _pageController = PageController(initialPage: _currentWeek - 1);
    _loadSchedule();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadSchedule() async {
    setState(() => _loading = true);
    try {
      final data = await _api.getSchedule(_currentWeek);
      _courses = (data['courses'] as List? ?? [])
          .map((c) => Course.fromJson(c))
          .toList();
    } catch (_) {
      // Try to show something anyway
    }
    setState(() => _loading = false);
  }

  void _goToWeek(int week) {
    if (week < 1 || week > _maxWeek) return;
    setState(() => _currentWeek = week);
    _loadSchedule();
  }

  @override
  Widget build(BuildContext context) {
    final screenW = MediaQuery.of(context).size.width;
    final timeColW = 56.0;
    final colW = (screenW - timeColW - 32) / 7;
    final gridH = 44.0 + 12 * 78.0;

    return Scaffold(
      appBar: AppBar(
        title: Text('课表 · $_semester'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // 周切换
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            color: const Color(0xFF1A1A2E),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed:
                      _currentWeek > 1 ? () => _goToWeek(_currentWeek - 1) : null,
                ),
                Text('第 $_currentWeek 周',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _currentWeek < _maxWeek
                      ? () => _goToWeek(_currentWeek + 1)
                      : null,
                ),
              ],
            ),
          ),
          // 表头
          Container(
            padding: EdgeInsets.only(left: timeColW),
            color: const Color(0xFF1A1A2E),
            child: Row(
              children: List.generate(7, (i) {
                return Container(
                  width: colW,
                  height: 36,
                  alignment: Alignment.center,
                  child: Text('周${_dayLabels[i + 1]}',
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w500)),
                );
              }),
            ),
          ),
          // 网格
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    child: SizedBox(
                      height: gridH,
                      child: Stack(
                        children: [
                          // 底网格
                          ...List.generate(12, (slot) {
                            return Positioned(
                              top: 44.0 + slot * 78.0,
                              left: 0,
                              right: 0,
                              child: SizedBox(
                                height: 78,
                                child: Row(
                                  children: [
                                    // 时间标签
                                    SizedBox(
                                      width: timeColW,
                                      child: Column(
                                        children: [
                                          const SizedBox(height: 2),
                                          Text(_slotLabels[slot],
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.bold,
                                                  color: Color(0xFF7C4DFF))),
                                          Text(_slotTimes[slot],
                                              style: TextStyle(
                                                  fontSize: 10,
                                                  color: Colors.grey[500])),
                                        ],
                                      ),
                                    ),
                                    // 7列网格
                                    ...List.generate(7, (day) {
                                      return Container(
                                        width: colW,
                                        height: 78,
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                              color: Colors.white10, width: 0.5),
                                        ),
                                      );
                                    }),
                                  ],
                                ),
                              ),
                            );
                          }),
                          // 课程卡片
                          ..._courses.map((c) {
                            final color = _hashColor(c.name);
                            return Positioned(
                              left: timeColW + (c.day - 1) * colW + 2,
                              top: 44.0 + (c.startSlot - 1) * 78.0 + 2,
                              child: Container(
                                width: colW - 4,
                                height: (c.endSlot - c.startSlot + 1) * 78.0 - 4,
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  color: color['bg']!.withOpacity(0.9),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                      color: color['border']!, width: 1),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      c.name,
                                      style: TextStyle(
                                        color: color['text'],
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    if (c.location != null)
                                      Text(
                                        c.location!,
                                        style: TextStyle(
                                            color: color['text']
                                                ?.withOpacity(0.7),
                                            fontSize: 9),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
