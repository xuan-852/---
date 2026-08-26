#include <array>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

class structure_element{
    private:
    //创建一个offset数组来存储有效结构元素的相对坐标位置
        std::vector<std::pair<int,int>> offsets;

    public:
    //构造函数，接受一个二维坐标数组作为结构元素
        structure_element(const std::vector<std::pair<int,int>>& positinon): offsets(positinon){}
    //获取结构里面的有效元素
        const std::vector<std::pair<int,int>>& get_offsets() const{
            return offsets;
        }

};

//创建一个IMAGE类来储存需要处理的图像
class Image{
    private:
        std::vector<std::vector<char>> data;    

    public:
        Image() : data(12, std::vector<char>(12, '.')) {} // 初始化为12x12的'.'

        void set_pixel(int row, int col, char value) {
            data[row][col] = value;
        }

        char get_pixel(int row, int col) const {
            return data[row][col];
        }
        
        void print() const {
            for (const auto& row : data) {
                for (char pixel : row) {
                    std::cout << pixel;
                }
                std::cout << '\n';
            }
        }

        void read_input() {
            std::string line;
            std::cout << "请输入12行图像（每行12个字符，只能使用'.'和'#'）：\n";
            for (int row = 0; row < 12; ++row) {
                if (!(std::cin >> line) || line.size() != 12) {
                    std::cerr << "输入错误：第" << row + 1
                              << "行必须正好包含12个字符。\n";
                    exit(1);
                }
                for (int col = 0; col < 12; ++col) {
                    if (line[col] != '.' && line[col] != '#') {
                        std::cerr << "输入错误：只能使用'.'和'#'。\n";
                        exit(1);
                    }
                    data[row][col] = line[col];
                }
            }
        }

        void dilate(const structure_element& se) {
            Image output;
            for (int row = 0; row < 12; ++row) {
                for (int col = 0; col < 12; ++col) {
                    if (get_pixel(row, col) == '#') {
                        for (const auto& offset : se.get_offsets()) {
                            int newRow = row + offset.first;
                            int newCol = col + offset.second;
                            if (newRow >= 0 && newRow < 12 && newCol >= 0 && newCol < 12) {
                                output.set_pixel(newRow, newCol, '#');
                            }
                        }
                    }
                }
            }
            data = output.data;
        }

        void corrode(const structure_element& se) {
            Image output;
            for (int row = 0; row < 12; ++row) {
                for (int col = 0; col < 12; ++col) {
                    if (get_pixel(row, col) == '#') {
                        bool can_corrode = true;
                        for (const auto& offset : se.get_offsets()) {
                            int newRow = row + offset.first;
                            int newCol = col + offset.second;
                            if (newRow >= 0 && newRow < 12 && newCol >= 0 && newCol < 12) {
                                if (get_pixel(newRow, newCol) != '#') {
                                    can_corrode = false;
                                    break;
                                }
                            } else {
                                can_corrode = false;
                                break;
                            }
                        }
                        if (can_corrode) {
                            output.set_pixel(row, col, '#');
                        } else {
                            output.set_pixel(row, col, '.');
                        }
                    } else {
                        output.set_pixel(row, col, '.');
                    }
                }
            }
            data = output.data;
        }
};

void main(){
    Image input;
    input.read_input();

    // 定义3x3结构元素的偏移量
    std::vector<std::pair<int,int>> offsets = {
        {-1, -1}, {-1, 0}, {-1, 1},
        {0, -1},           {0, 1},
        {1, -1}, {1, 0}, {1, 1}
    };
    structure_element se(offsets);

    input.dilate(se);
    std::cout << "\n使用3x3结构元素膨胀后的结果：\n";
    input.print();

    input.corrode(se);
    std::cout << "\n使用3x3结构元素腐蚀后的结果：\n";
    input.print();
}