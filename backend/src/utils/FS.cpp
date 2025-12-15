#include "utils/FS.hpp"

#include <filesystem>

namespace tt::utils
{

std::filesystem::path data_root()
{
    auto root = std::filesystem::current_path();
    root /= "data";
    std::filesystem::create_directories(root);
    return root;
}

} // namespace tt::utils
