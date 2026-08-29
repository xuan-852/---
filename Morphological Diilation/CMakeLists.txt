cmake_minimum_required(VERSION 3.16)
project(morphology_task LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(morphology morphology.cpp)
target_include_directories(morphology PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(morphology PRIVATE -Wall -Wextra -Wpedantic)

add_executable(morphology_cli work3_pkg.cpp)
target_link_libraries(morphology_cli PRIVATE morphology)
target_compile_options(morphology_cli PRIVATE -Wall -Wextra -Wpedantic)

include(CTest)
if(BUILD_TESTING)
    add_executable(morphology_tests test_morphology.cpp)
    target_link_libraries(morphology_tests PRIVATE morphology)
    target_compile_options(morphology_tests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME morphology_tests COMMAND morphology_tests)
endif()
