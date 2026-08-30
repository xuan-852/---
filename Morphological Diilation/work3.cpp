#include <array>
#include <iostream>
#include <string>
#include <vector>

constexpr int IMAGE_SIZE = 12;

// 结构元素：保存相对于中心点的有效偏移位置。
class StructuringElement {
private:
    std::vector<std::pair<int, int>> offsets;

public:
    // 从用户输入读取一个 5×5 结构元素。
    bool read() {
        offsets.clear();
        bool hasCenter = false;

        for (int row = 0; row < 5; ++row) {
            std::string line;

            if (!(std::cin >> line) || line.size() != 5) {
                return false;
            }

            for (int col = 0; col < 5; ++col) {
                if (line[col] != '.' && line[col] != '#') {
                    return false;
                }

                if (line[col] == '#') {
                    // 以中心 (2, 2) 为原点保存偏移量。
                    offsets.emplace_back(row - 2, col - 2);

                    if (row == 2 && col == 2) {
                        hasCenter = true;
                    }
                }
            }
        }

        // 结构元素通常必须包含中心点。
        return hasCenter && !offsets.empty();
    }

    const std::vector<std::pair<int, int>>& getOffsets() const {
        return offsets;
    }

};

class Image {
private:
    using PixelGrid =
        std::array<std::array<char, IMAGE_SIZE>, IMAGE_SIZE>;

    PixelGrid pixels{};

    bool isInside(int row, int col) const {
        return row >= 0 && row < IMAGE_SIZE &&
               col >= 0 && col < IMAGE_SIZE;
    }

public:
    Image() {
        for (auto& row : pixels) {
            row.fill('.');
        }
    }

    bool read() {
        std::string line;

        for (int row = 0; row < IMAGE_SIZE; ++row) {
            if (!(std::cin >> line) ||
                line.size() != IMAGE_SIZE) {
                return false;
            }

            for (int col = 0; col < IMAGE_SIZE; ++col) {
                if (line[col] != '.' && line[col] != '#') {
                    return false;
                }
                pixels[row][col] = line[col];
            }
        }

        return true;
    }

    void print() const {
        for (const auto& row : pixels) {
            for (char pixel : row) {
                std::cout << pixel;
            }
            std::cout << '\n';
        }
    }

    Image dilation(const StructuringElement& element) const {
        Image output;

        for (int row = 0; row < IMAGE_SIZE; ++row) {
            for (int col = 0; col < IMAGE_SIZE; ++col) {
                if (pixels[row][col] != '#') {
                    continue;
                }

                for (const auto& offset : element.getOffsets()) {
                    int newRow = row + offset.first;
                    int newCol = col + offset.second;

                    if (output.isInside(newRow, newCol)) {
                        output.pixels[newRow][newCol] = '#';
                    }
                }
            }
        }

        return output;
    }

    Image erosion(const StructuringElement& element) const {
        Image output;

        for (int row = 0; row < IMAGE_SIZE; ++row) {
            for (int col = 0; col < IMAGE_SIZE; ++col) {
                bool canKeep = true;

                for (const auto& offset : element.getOffsets()) {
                    int newRow = row + offset.first;
                    int newCol = col + offset.second;

                    if (!isInside(newRow, newCol) ||
                        pixels[newRow][newCol] != '#') {
                        canKeep = false;
                        break;
                    }
                }

                if (canKeep) {
                    output.pixels[row][col] = '#';
                }
            }
        }

        return output;
    }
};

int main() {
    Image input;

    std::cout << "请输入12行图像（每行12个字符，只能使用'.'和'#'）：\n";
    if (!input.read()) {
        std::cerr << "输入格式错误。\n";
        return 1;
    }

    int operation = 0;
    std::cout << "请选择操作：1. 膨胀  2. 腐蚀\n";
    std::cin >> operation;

    std::cout << "请输入自定义的5x5结构元素（使用'#'表示有效位置，'.'表示无效位置）：\n";
    StructuringElement element;

    if (!element.read()) {
        std::cerr << "结构元素输入格式错误，且中心位置必须为'#'。\n";
        return 1;
    }

    if (operation != 1 && operation != 2) {
        std::cerr << "选择无效。\n";
        return 1;
    }

    Image result = operation == 1
        ? input.dilation(element)
        : input.erosion(element);

    std::cout << "\n处理结果：\n";
    result.print();

    return 0;
}
