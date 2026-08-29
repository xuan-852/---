#include "morphology.hpp"

#include <ostream>
#include <stdexcept>
#include <utility>

namespace morphology {

Image::Image(std::size_t rows, std::size_t cols, char fill)
    : pixels_(rows, std::string(cols, fill)) {}

Image Image::from_strings(const std::vector<std::string>& rows) {
    if (rows.empty()) {
        throw std::invalid_argument("图像不能为空");
    }
    if (rows.front().empty()) {
        throw std::invalid_argument("图像列数不能为0");
    }

    const std::size_t width = rows.front().size();
    Image image(rows.size(), width);
    for (std::size_t row = 0; row < rows.size(); ++row) {
        if (rows[row].size() != width) {
            throw std::invalid_argument("图像每一行必须具有相同长度");
        }
        for (char pixel : rows[row]) {
            if (pixel != '.' && pixel != '#') {
                throw std::invalid_argument("图像只能包含'.'和'#'");
            }
        }
        image.pixels_[row] = rows[row];
    }
    return image;
}

std::size_t Image::rows() const noexcept {
    return pixels_.size();
}

std::size_t Image::cols() const noexcept {
    return pixels_.empty() ? 0 : pixels_.front().size();
}

char Image::at(std::size_t row, std::size_t col) const {
    return pixels_.at(row).at(col);
}

void Image::set(std::size_t row, std::size_t col, char value) {
    if (value != '.' && value != '#') {
        throw std::invalid_argument("像素只能设置为'.'或'#'");
    }
    pixels_.at(row).at(col) = value;
}

std::size_t Image::foreground_count() const noexcept {
    std::size_t count = 0;
    for (const auto& row : pixels_) {
        for (char pixel : row) {
            count += pixel == '#';
        }
    }
    return count;
}

const std::vector<std::string>& Image::data() const noexcept {
    return pixels_;
}

std::string Image::to_string() const {
    std::string result;
    for (std::size_t row = 0; row < rows(); ++row) {
        result += pixels_[row];
        if (row + 1 < rows()) {
            result += '\n';
        }
    }
    return result;
}

StructuringElement::StructuringElement(std::vector<Offset> offsets)
    : offsets_(std::move(offsets)) {
    if (offsets_.empty()) {
        throw std::invalid_argument("结构元素至少需要一个有效位置");
    }
}

StructuringElement StructuringElement::square(int radius) {
    if (radius < 0) {
        throw std::invalid_argument("结构元素半径不能为负数");
    }

    std::vector<Offset> offsets;
    for (int row = -radius; row <= radius; ++row) {
        for (int col = -radius; col <= radius; ++col) {
            offsets.emplace_back(row, col);
        }
    }
    return StructuringElement(std::move(offsets));
}

StructuringElement StructuringElement::circle(int radius) {
    if (radius < 0) {
        throw std::invalid_argument("结构元素半径不能为负数");
    }

    std::vector<Offset> offsets;
    for (int row = -radius; row <= radius; ++row) {
        for (int col = -radius; col <= radius; ++col) {
            if (row * row + col * col <= radius * radius) {
                offsets.emplace_back(row, col);
            }
        }
    }
    return StructuringElement(std::move(offsets));
}

StructuringElement StructuringElement::from_mask(
    const std::vector<std::string>& mask) {
    if (mask.empty() || mask.front().empty() || mask.size() % 2 == 0 ||
        mask.front().size() % 2 == 0) {
        throw std::invalid_argument("结构元素掩码必须是非空奇数阶矩阵");
    }

    const std::size_t width = mask.front().size();
    const int center_row = static_cast<int>(mask.size() / 2);
    const int center_col = static_cast<int>(width / 2);
    std::vector<Offset> offsets;

    for (std::size_t row = 0; row < mask.size(); ++row) {
        if (mask[row].size() != width) {
            throw std::invalid_argument("结构元素掩码每一行必须等长");
        }
        for (std::size_t col = 0; col < width; ++col) {
            if (mask[row][col] == '#' || mask[row][col] == '1') {
                offsets.emplace_back(static_cast<int>(row) - center_row,
                                     static_cast<int>(col) - center_col);
            } else if (mask[row][col] != '.' && mask[row][col] != '0') {
                throw std::invalid_argument("结构元素掩码只能包含0/1或./#");
            }
        }
    }
    return StructuringElement(std::move(offsets));
}

const std::vector<StructuringElement::Offset>&
StructuringElement::offsets() const noexcept {
    return offsets_;
}

namespace {

bool inside(const Image& image, int row, int col) {
    return row >= 0 && col >= 0 &&
           row < static_cast<int>(image.rows()) &&
           col < static_cast<int>(image.cols());
}

}  // namespace

Image dilate(const Image& input, const StructuringElement& element) {
    Image output(input.rows(), input.cols());

    for (std::size_t row = 0; row < input.rows(); ++row) {
        for (std::size_t col = 0; col < input.cols(); ++col) {
            if (input.at(row, col) != '#') {
                continue;
            }
            for (const auto& [row_offset, col_offset] : element.offsets()) {
                const int new_row = static_cast<int>(row) + row_offset;
                const int new_col = static_cast<int>(col) + col_offset;
                if (inside(input, new_row, new_col)) {
                    output.set(static_cast<std::size_t>(new_row),
                               static_cast<std::size_t>(new_col), '#');
                }
            }
        }
    }
    return output;
}

Image erode(const Image& input, const StructuringElement& element) {
    Image output(input.rows(), input.cols());

    for (std::size_t row = 0; row < input.rows(); ++row) {
        for (std::size_t col = 0; col < input.cols(); ++col) {
            bool remains_foreground = true;
            for (const auto& [row_offset, col_offset] : element.offsets()) {
                const int checked_row = static_cast<int>(row) + row_offset;
                const int checked_col = static_cast<int>(col) + col_offset;
                if (!inside(input, checked_row, checked_col) ||
                    input.at(static_cast<std::size_t>(checked_row),
                             static_cast<std::size_t>(checked_col)) != '#') {
                    remains_foreground = false;
                    break;
                }
            }
            if (remains_foreground) {
                output.set(row, col, '#');
            }
        }
    }
    return output;
}

std::ostream& operator<<(std::ostream& output, const Image& image) {
    return output << image.to_string();
}

}  // namespace morphology
