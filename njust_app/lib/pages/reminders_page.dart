import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/models.dart';

const List<Map<String, dynamic>> categories = [
  {'key': 'default', 'label': '📋 通用', 'color': Color(0xFF7C4DFF)},
  {'key': 'exam', 'label': '📝 考试', 'color': Color(0xFFFF4D6D)},
  {'key': 'study', 'label': '📚 学习', 'color': Color(0xFF4DFF88)},
  {'key': 'life', 'label': '🎯 生活', 'color': Color(0xFFFF884D)},
  {'key': 'work', 'label': '💼 工作', 'color': Color(0xFF4DD4FF)},
  {'key': 'health', 'label': '❤️ 健康', 'color': Color(0xFFFF6B9D)},
];

const Map<int, Map<String, dynamic>> priorityMap = {
  0: {'label': '普通', 'color': Color(0xFF888888)},
  1: {'label': '重要', 'color': Color(0xFFFF9800)},
  2: {'label': '紧急', 'color': Color(0xFFFF4444)},
};

class RemindersPage extends StatefulWidget {
  const RemindersPage({super.key});

  @override
  State<RemindersPage> createState() => _RemindersPageState();
}

class _RemindersPageState extends State<RemindersPage> {
  final _api = ApiService();
  List<Reminder> _reminders = [];
  bool _loading = true;
  String _activeCategory = '';

  // 表单
  bool _showForm = false;
  final _textController = TextEditingController();
  int _formPriority = 0;
  String _formCategory = 'default';
  int? _editingId;
  String _formTitle = '新建便签';

  @override
  void initState() {
    super.initState();
    _loadReminders();
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _loadReminders() async {
    setState(() => _loading = true);
    try {
      final params = <String, dynamic>{};
      if (_activeCategory.isNotEmpty) params['category'] = _activeCategory;
      final data = await _api.getReminders(category: _activeCategory.isNotEmpty ? _activeCategory : null);
      _reminders = (data['reminders'] as List? ?? [])
          .map((r) => Reminder.fromJson(r))
          .toList();
    } catch (_) {
      // 离线
    }
    setState(() => _loading = false);
  }

  void _openNewForm() {
    setState(() {
      _showForm = true;
      _editingId = null;
      _textController.clear();
      _formPriority = 0;
      _formCategory = 'default';
      _formTitle = '新建便签';
    });
  }

  void _openEditForm(Reminder r) {
    setState(() {
      _showForm = true;
      _editingId = r.id;
      _textController.text = r.text;
      _formPriority = r.priority;
      _formCategory = r.category;
      _formTitle = '编辑便签';
    });
  }

  Future<void> _submitForm() async {
    if (_textController.text.trim().isEmpty) return;
    setState(() => _showForm = false);
    try {
      final data = {
        'text': _textController.text.trim(),
        'priority': _formPriority,
        'category': _formCategory,
      };
      if (_editingId != null) {
        await _api.updateReminder(_editingId!, data);
      } else {
        await _api.createReminder(data);
      }
      _loadReminders();
    } catch (_) {}
  }

  Future<void> _toggleDone(Reminder r) async {
    if (r.id == null) return;
    try {
      await _api.toggleReminder(r.id!, !r.done);
      _loadReminders();
    } catch (_) {}
  }

  Future<void> _deleteReminder(Reminder r) async {
    if (r.id == null) return;
    try {
      await _api.deleteReminder(r.id!);
      _loadReminders();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('便签')),
      body: Stack(
        children: [
          Column(
            children: [
              // 分类筛选
              Container(
                height: 48,
                color: const Color(0xFF1A1A2E),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    _buildCategoryChip('', '全部'),
                    ...categories.map((c) =>
                        _buildCategoryChip(c['key'] as String, c['label'] as String)),
                  ],
                ),
              ),
              // 列表
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        onRefresh: _loadReminders,
                        child: _reminders.isEmpty
                            ? ListView(
                                children: const [
                                  SizedBox(height: 100),
                                  Center(
                                    child: Column(
                                      children: [
                                        Text('📝', style: TextStyle(fontSize: 48)),
                                        SizedBox(height: 8),
                                        Text('暂无便签',
                                            style: TextStyle(color: Colors.grey)),
                                      ],
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(12),
                                itemCount: _reminders.length,
                                itemBuilder: (_, i) =>
                                    _buildReminderCard(_reminders[i]),
                              ),
                      ),
              ),
            ],
          ),
          // 表单覆盖层
          if (_showForm) _buildFormOverlay(),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openNewForm,
        backgroundColor: const Color(0xFF7C4DFF),
        child: const Icon(Icons.add),
      ),
    );
  }

  // 表单弹窗
  Widget _buildFormOverlay() {
    return _buildFormSheet();
  }

  Widget _buildCategoryChip(String key, String label) {
    final active = _activeCategory == key;
    return GestureDetector(
      onTap: () {
        setState(() => _activeCategory = key);
        _loadReminders();
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active
              ? const Color(0xFF7C4DFF).withOpacity(0.3)
              : Colors.white10,
          borderRadius: BorderRadius.circular(20),
          border: active
              ? Border.all(color: const Color(0xFF7C4DFF))
              : null,
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 13,
                color: active ? const Color(0xFF7C4DFF) : Colors.grey)),
      ),
    );
  }

  Widget _buildReminderCard(Reminder r) {
    final catColor = categories.firstWhere(
        (c) => c['key'] == r.category,
        orElse: () => categories[0])['color'] as Color;
    final pri = priorityMap[r.priority] ?? priorityMap[0]!;
    final expired = r.isExpired;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: expired
            ? const Color(0xFF3E1A1A)
            : const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(10),
        border: expired
            ? Border.all(color: Colors.red.withOpacity(0.3))
            : null,
      ),
      child: InkWell(
        onTap: () => _openEditForm(r),
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 勾选
              GestureDetector(
                onTap: () => _toggleDone(r),
                child: Container(
                  width: 22,
                  height: 22,
                  margin: const EdgeInsets.only(top: 2, right: 12),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: r.done ? catColor : Colors.grey,
                      width: 2,
                    ),
                    color: r.done ? catColor : Colors.transparent,
                  ),
                  child: r.done
                      ? const Icon(Icons.check, size: 14, color: Colors.white)
                      : null,
                ),
              ),
              // 内容
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.text,
                      style: TextStyle(
                        fontSize: 14,
                        decoration: r.done ? TextDecoration.lineThrough : null,
                        color: r.done ? Colors.grey : Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: (pri['color'] as Color).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(pri['label'] as String,
                              style: TextStyle(
                                  fontSize: 10,
                                  color: pri['color'] as Color)),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: catColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            categories.firstWhere(
                                    (c) => c['key'] == r.category,
                                    orElse: () => categories[0])['label']
                                as String,
                            style: TextStyle(
                                fontSize: 10, color: catColor),
                          ),
                        ),
                        if (expired) ...[
                          const SizedBox(width: 6),
                          const Text('已过期',
                              style: TextStyle(
                                  fontSize: 10, color: Colors.red)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              // 删除
              GestureDetector(
                onTap: () => _deleteReminder(r),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: Icon(Icons.close, size: 18, color: Colors.grey),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFormSheet() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          left: 16,
          right: 16,
          top: 16,
        ),
        decoration: const BoxDecoration(
          color: Color(0xFF1A1A2E),
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_formTitle,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _showForm = false),
                ),
              ],
            ),
            TextField(
              controller: _textController,
              autofocus: true,
              maxLines: 3,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: '输入便签内容...',
                filled: true,
                fillColor: Colors.white10,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                // 优先级
                ...priorityMap.entries.map((e) {
                  final active = _formPriority == e.key;
                  return GestureDetector(
                    onTap: () =>
                        setState(() => _formPriority = e.key),
                    child: Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: active
                            ? (e.value['color'] as Color).withOpacity(0.2)
                            : Colors.white10,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(e.value['label'] as String,
                          style: TextStyle(
                            fontSize: 12,
                            color: active
                                ? e.value['color'] as Color
                                : Colors.grey,
                          )),
                    ),
                  );
                }),
                const Spacer(),
                ElevatedButton(
                  onPressed: _submitForm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF7C4DFF),
                  ),
                  child: Text(_editingId != null ? '保存' : '创建'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
