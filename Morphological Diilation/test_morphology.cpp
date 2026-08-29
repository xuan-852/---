#include "morphology.hpp"

#include <cassert>
#include <iostream>

using morphology::Image;
using morphology::StructuringElement;

int main() {
    const auto square5 = StructuringElement::square(2);
    const auto circle5 = StructuringElement::circle(2);

    // 单个中心前景点经过5x5方形膨胀后应有25个前景像素。
    const Image single_point = Image::from_strings({
        "............", "............", "............", "............",
        "............", ".....#......", "............", "............",
        "............", "............", "............", "............"});
    const Image square_dilated = morphology::dilate(single_point, square5);
    assert(square_dilated.foreground_count() == 25);
    assert(square_dilated.at(3, 3) == '#');
    assert(square_dilated.at(7, 7) == '#');
    assert(square_dilated.at(2, 2) == '.');

    // 半径2的圆形结构元素包含13个位置，能产生圆角膨胀效果。
    const Image circle_dilated = morphology::dilate(single_point, circle5);
    assert(circle_dilated.foreground_count() == 13);
    assert(circle_dilated.at(3, 5) == '#');
    assert(circle_dilated.at(3, 3) == '.');

    // 5x5满前景图像腐蚀后只剩中心点；边界外按背景处理。
    const Image block = Image::from_strings({
        "............", "............", "............", "...#####....",
        "...#####....", "...#####....", "...#####....", "...#####....",
        "............", "............", "............", "............"});
    const Image eroded = morphology::erode(block, square5);
    assert(eroded.foreground_count() == 1);
    assert(eroded.at(5, 5) == '#');

    const Image full(12, 12, '#');
    const Image eroded_full = morphology::erode(full, square5);
    assert(eroded_full.foreground_count() == 64);
    assert(eroded_full.at(0, 0) == '.');
    assert(eroded_full.at(2, 2) == '#');

    // 结构元素可以由任意掩码替换，例如十字形。
    const auto cross = StructuringElement::from_mask({
        "..#..", "..#..", "#####", "..#..", "..#.."});
    assert(cross.offsets().size() == 9);

    std::cout << "所有形态学算法测试通过。\n";
    return 0;
}
