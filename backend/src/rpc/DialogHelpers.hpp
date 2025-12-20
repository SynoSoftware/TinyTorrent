#pragma once

#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace tt::rpc
{
#if defined(_WIN32)
struct DialogFilterSpec
{
    std::wstring name;
    std::wstring pattern;
};

struct OpenDialogOptions
{
    std::wstring title;
    bool allow_multiple = false;
    std::vector<DialogFilterSpec> filters;
};

struct FolderDialogOptions
{
    std::wstring title;
};

struct SaveDialogOptions
{
    std::wstring title;
    std::wstring default_name;
    std::vector<DialogFilterSpec> filters;
};

struct DialogPathsOutcome
{
    bool cancelled = false;
    std::vector<std::string> paths;
    std::string error;
};

struct DialogPathOutcome
{
    bool cancelled = false;
    std::optional<std::string> path;
    std::string error;
};

using DialogOpenHandler =
    std::function<DialogPathsOutcome(OpenDialogOptions const &)>;
using DialogFolderHandler =
    std::function<DialogPathOutcome(FolderDialogOptions const &)>;
using DialogSaveHandler =
    std::function<DialogPathOutcome(SaveDialogOptions const &)>;

namespace test
{
void override_dialog_open_handler(DialogOpenHandler handler);
void override_dialog_folder_handler(DialogFolderHandler handler);
void override_dialog_save_handler(DialogSaveHandler handler);
void reset_dialog_handlers();
} // namespace test
#endif
} // namespace tt::rpc
