#ifndef MORPHOLOGY_HPP
#define MORPHOLOGY_HPP

#include <cstddef>
#include <iosfwd>
#include <string>
#include <utility>
#include <vector>

namespace morphology {

class Image {
public:
    Image(std::size_t rows, std::size_t cols, char fill = '.');

    static Image from_strings(const std::vector<std::string>& rows);

    std::size_t rows() const noexcept;
    std::size_t cols() const noexcept;
    char at(std::size_t row, std::size_t col) const;
    void set(std::size_t row, std::size_t col, char value);
    std::size_t foreground_count() const noexcept;
    const std::vector<std::string>& data() const noexcept;
    std::string to_string() const;

private:
    std::vector<std::string> pixels_;
};

class StructuringElement {
public:
    using Offset = std::pair<int, int>;

    explicit StructuringElement(std::vector<Offset> offsets);

    static StructuringElement square(int radius);
    static StructuringElement circle(int radius);
    static StructuringElement from_mask(const std::vector<std::string>& mask);

    const std::vector<Offset>& offsets() const noexcept;

private:
    std::vector<Offset> offsets_;
};

Image dilate(const Image& input, const StructuringElement& element);
Image erode(const Image& input, const StructuringElement& element);

std::ostream& operator<<(std::ostream& output, const Image& image);

}  // namespace morphology

#endif
