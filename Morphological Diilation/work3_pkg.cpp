#include "morphology.hpp"

#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

constexpr std::size_t IMAGE_SIZE = 12;

morphology::Image read_image() {
    std::vector<std::string> rows;
    rows.reserve(IMAGE_SIZE);

    std::cout << "请输入12行图像（每行12个字符，只能使用'.'和'#'）：\n";
    for (std::size_t row = 0; row < IMAGE_SIZE; ++row) {
        std::string line;
        if (!(std::cin >> line) || line.size() != IMAGE_SIZE) {
            throw std::runtime_error("第" + std::to_string(row + 1) +
                                     "行必须正好包含12个字符");
        }
        rows.push_back(line);
    }
    return morphology::Image::from_strings(rows);
}

void print_result(const std::string& title, const morphology::Image& image) {
    std::cout << "\n" << title << "：\n" << image << "\n";
}

}  // namespace

int main() {
    try {
        const morphology::Image input = read_image();
        const auto square5 = morphology::StructuringElement::square(2);
        const auto circle5 = morphology::StructuringElement::circle(2);

        print_result("原图", input);
        print_result("5x5方形结构元素膨胀（dilation1）",
                     morphology::dilate(input, square5));
        print_result("5x5圆形结构元素膨胀（dilation2）",
                     morphology::dilate(input, circle5));
        print_result("5x5方形结构元素腐蚀", morphology::erode(input, square5));
        print_result("5x5圆形结构元素腐蚀", morphology::erode(input, circle5));
    } catch (const std::exception& error) {
        std::cerr << "输入或处理失败：" << error.what() << '\n';
        return 1;
    }
    return 0;
}
