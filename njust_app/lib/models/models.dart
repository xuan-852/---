// ─── 学期信息 ───
class SemesterInfo {
  final int week;
  final int maxWeek;
  final String semester;

  SemesterInfo({
    required this.week,
    required this.maxWeek,
    required this.semester,
  });
}

// ─── 课程 ───
class Course {
  final int? id;
  final String name;
  final String? teacher;
  final String? location;
  final int day; // 1=周一..7=周日
  final int startSlot;
  final int endSlot;
  final String? startTime;
  final String? endTime;
  final int weekStart;
  final int weekEnd;
  final String? weeks; // 如 "1-16" 或 "1,3,5"
  final int? credit;
  final String? courseType;

  Course({
    this.id,
    required this.name,
    this.teacher,
    this.location,
    required this.day,
    required this.startSlot,
    required this.endSlot,
    this.startTime,
    this.endTime,
    required this.weekStart,
    required this.weekEnd,
    this.weeks,
    this.credit,
    this.courseType,
  });

  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      id: json['id'] as int?,
      name: json['name'] as String? ?? json['course_name'] as String? ?? '',
      teacher: json['teacher'] as String?,
      location: json['location'] as String? ?? json['classroom'] as String?,
      day: json['day'] is int ? json['day'] as int : int.tryParse('${json['day']}') ?? 1,
      startSlot: json['start_slot'] is int
          ? json['start_slot'] as int
          : int.tryParse('${json['start_slot']}') ?? 1,
      endSlot: json['end_slot'] is int
          ? json['end_slot'] as int
          : int.tryParse('${json['end_slot']}') ?? 1,
      startTime: json['start_time'] as String?,
      endTime: json['end_time'] as String?,
      weekStart: json['week_start'] is int
          ? json['week_start'] as int
          : int.tryParse('${json['week_start']}') ?? 1,
      weekEnd: json['week_end'] is int
          ? json['week_end'] as int
          : int.tryParse('${json['week_end']}') ?? 20,
      weeks: json['weeks'] as String?,
      credit: json['credit'] is int
          ? json['credit'] as int
          : (json['credit'] != null ? int.tryParse('${json['credit']}') : null),
      courseType: json['course_type'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'teacher': teacher,
        'location': location,
        'day': day,
        'start_slot': startSlot,
        'end_slot': endSlot,
        'start_time': startTime,
        'end_time': endTime,
        'week_start': weekStart,
        'week_end': weekEnd,
        'weeks': weeks,
        'credit': credit,
        'course_type': courseType,
      };
}

// ─── 成绩 ───
class Score {
  final String name;
  final String score;
  final double credit;
  final String semester;
  final String? scoreType;

  Score({
    required this.name,
    required this.score,
    required this.credit,
    required this.semester,
    this.scoreType,
  });

  factory Score.fromJson(Map<String, dynamic> json) {
    return Score(
      name: json['name'] as String? ?? json['course_name'] as String? ?? '',
      score: '${json['score'] ?? '0'}',
      credit: (json['credit'] as num?)?.toDouble() ?? 0.0,
      semester: json['semester'] as String? ?? '',
      scoreType: json['score_type'] as String?,
    );
  }

  double get gpaPoint {
    double? val = double.tryParse(score);
    if (val == null) {
      // 中文等级 → 映射为数值
      const map = {
        '优': 90, '优-': 87, '良+': 83, '良': 80, '良-': 76,
        '中+': 73, '中': 70, '中-': 66, '及格': 60, '不及格': 0,
      };
      val = map[score.trim()]?.toDouble();
    }
    if (val == null || val < 60) return 0;
    final g = (val - 50) / 10;
    return g.clamp(0, 4.0);
  }
}

// ─── 考试 ───
class Exam {
  final String name;
  final String? date;
  final String? time;
  final String? location;
  final String? seatNumber;
  final String? status;
  final String? startTime;
  final String? endTime;

  Exam({
    required this.name,
    this.date,
    this.time,
    this.location,
    this.seatNumber,
    this.status,
    this.startTime,
    this.endTime,
  });

  factory Exam.fromJson(Map<String, dynamic> json) {
    // 兼容 DB 字段 (exam_date, start_time, end_time) 和 API 字段 (date, time)
    final rawDate = json['exam_date'] as String? ?? json['date'] as String?;
    final rawStart = json['start_time'] as String?;
    final rawEnd = json['end_time'] as String?;
    final rawTime = json['time'] as String?;

    String? formattedTime;
    if (rawTime != null) {
      formattedTime = rawTime;
    } else if (rawStart != null && rawEnd != null) {
      formattedTime = '$rawStart-$rawEnd';
    } else if (rawStart != null) {
      formattedTime = rawStart;
    }

    return Exam(
      name: json['name'] as String? ?? json['course_name'] as String? ?? '',
      date: rawDate,
      time: formattedTime,
      location: json['location'] as String? ?? json['classroom'] as String?,
      seatNumber: json['seat_number'] as String?,
      status: json['status'] as String?,
      startTime: rawStart,
      endTime: rawEnd,
    );
  }

  /// 考试是否已经结束（根据日期+结束时间判断）
  bool get isFinished {
    if (date == null) return false;
    try {
      final examDate = DateTime.parse(date!);
      final now = DateTime.now();
      // 只比较日期：考试日期 < 今天 → 已过
      if (examDate.year < now.year ||
          (examDate.year == now.year && examDate.month < now.month) ||
          (examDate.year == now.year && examDate.month == now.month && examDate.day < now.day)) {
        return true;
      }
      // 同一天 + 有结束时间 → 比较时间
      if (endTime != null &&
          examDate.year == now.year &&
          examDate.month == now.month &&
          examDate.day == now.day) {
        final parts = endTime!.split(':');
        if (parts.length == 2) {
          final endHour = int.tryParse(parts[0]) ?? 0;
          final endMin = int.tryParse(parts[1]) ?? 0;
          final endDt = DateTime(now.year, now.month, now.day, endHour, endMin);
          return now.isAfter(endDt);
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  }
}

// ─── 便签 ───
class Reminder {
  final int? id;
  final String text;
  final int priority; // 0=普通 1=重要 2=紧急
  final String category;
  final bool done;
  final String? remindAt;
  final String? createdAt;
  final String? updatedAt;

  Reminder({
    this.id,
    required this.text,
    this.priority = 0,
    this.category = 'default',
    this.done = false,
    this.remindAt,
    this.createdAt,
    this.updatedAt,
  });

  factory Reminder.fromJson(Map<String, dynamic> json) {
    return Reminder(
      id: json['id'] as int?,
      text: json['text'] as String? ?? json['content'] as String? ?? '',
      priority: json['priority'] as int? ?? 0,
      category: json['category'] as String? ?? 'default',
      done: json['done'] == 1 || json['done'] == true,
      remindAt: json['remind_at'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'text': text,
        'priority': priority,
        'category': category,
        'done': done ? 1 : 0,
        if (remindAt != null) 'remind_at': remindAt,
      };

  bool get isExpired {
    if (remindAt == null) return false;
    try {
      final dt = DateTime.parse(remindAt!);
      return dt.isBefore(DateTime.now());
    } catch (_) {
      return false;
    }
  }
}

// ─── API 响应 ├─
class ApiResponse<T> {
  final String status;
  final T? data;
  final String? message;

  ApiResponse({required this.status, this.data, this.message});
}
