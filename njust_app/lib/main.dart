import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'pages/index_page.dart';
import 'pages/schedule_page.dart';
import 'pages/reminders_page.dart';
import 'pages/scores_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  ApiService().initProbe();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '南理工课表助手',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF7C4DFF),
        scaffoldBackgroundColor: const Color(0xFF0F0F23),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF7C4DFF),
          secondary: Color(0xFF7C4DFF),
          surface: Color(0xFF1A1A2E),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1A1A2E),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Color(0xFF1A1A2E),
          selectedItemColor: Color(0xFF7C4DFF),
          unselectedItemColor: Color(0xFF666666),
          type: BottomNavigationBarType.fixed,
        ),
      ),
      home: const MainScreen(),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  final List<Widget> _pages = const [
    IndexPage(),
    SchedulePage(),
    RemindersPage(),
    ScoresPage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.today), label: '今天'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_month), label: '课表'),
          BottomNavigationBarItem(icon: Icon(Icons.sticky_note_2), label: '便签'),
          BottomNavigationBarItem(icon: Icon(Icons.assessment), label: '成绩'),
        ],
      ),
    );
  }
}
