#include <array>
#include <iostream>
#include <string>

constexpr int SIZE = 12;

using Image = std::array<std::array<char, SIZE>, SIZE>;

// 使用 3x3 的全“#”结构元素进行膨胀。
Image dilate(const Image& input) {
    Image output{};

    for (auto& row : output) {
        row.fill('.');
    }

    for (int row = 0; row < SIZE; ++row) {
        for (int col = 0; col < SIZE; ++col) {
            if (input[row][col] != '#') {
                continue;
            }

            // 让当前“#”覆盖以它为中心的 3x3 区域。
            for (int dr = -1; dr <= 1; ++dr) {
                for (int dc = -1; dc <= 1; ++dc) {
                    const int newRow = row + dr;
                    const int newCol = col + dc;

                    if (newRow >= 0 && newRow < SIZE &&
                        newCol >= 0 && newCol < SIZE) {
                        output[newRow][newCol] = '#';
                    }
                }
            }
        }
    }

    return output;
}

int main() {
    Image input{};
    std::string line;

    std::cout << "请输入12行图像（每行12个字符，只能使用'.'和'#'）：\n";

    for (int row = 0; row < SIZE; ++row) {
        if (!(std::cin >> line) || line.size() != SIZE) {
            std::cerr << "输入错误：第" << row + 1
                      << "行必须正好包含12个字符。\n";
            return 1;
        }

        for (int col = 0; col < SIZE; ++col) {
            if (line[col] != '.' && line[col] != '#') {
                std::cerr << "输入错误：只能使用'.'和'#'。\n";
                return 1;
            }
            input[row][col] = line[col];
        }
    }

    const Image output = dilate(input);

    std::cout << "\n使用3x3结构元素膨胀后的结果：\n";
    for (const auto& row : output) {
        for (char pixel : row) {
            std::cout << pixel;
        }
        std::cout << '\n';
    }

    return 0;
}
