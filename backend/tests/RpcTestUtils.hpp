#pragma once

#include <stdexcept>
#include <string>
#include <string_view>

#include <yyjson.h>

namespace tt::tests
{

class ResponseView
{
  public:
    explicit ResponseView(std::string const &payload)
    {
        doc_ = yyjson_read(payload.data(), payload.size(), 0);
        if (doc_ == nullptr)
        {
            throw std::runtime_error("failed to parse JSON response");
        }
        root_ = yyjson_doc_get_root(doc_);
        if (root_ == nullptr || !yyjson_is_obj(root_))
        {
            throw std::runtime_error("response root is not an object");
        }
    }

    ~ResponseView()
    {
        if (doc_)
        {
            yyjson_doc_free(doc_);
        }
    }

    std::string_view result() const
    {
        return get_str_member("result", "missing result key");
    }

    yyjson_val *arguments() const
    {
        return yyjson_obj_get(root_, "arguments");
    }

    yyjson_val *argument(char const *key) const
    {
        auto *args = arguments();
        return args ? yyjson_obj_get(args, key) : nullptr;
    }

  private:
    std::string_view get_str_member(char const *key, char const *error) const
    {
        yyjson_val *value = yyjson_obj_get(root_, key);
        if (value == nullptr || !yyjson_is_str(value))
        {
            throw std::runtime_error(error);
        }
        return yyjson_get_str(value);
    }

    yyjson_doc *doc_ = nullptr;
    yyjson_val *root_ = nullptr;
};

inline std::string_view to_view(yyjson_val *value)
{
    if (value == nullptr || !yyjson_is_str(value))
    {
        return {};
    }
    return yyjson_get_str(value);
}

inline void expect_result(ResponseView const &response,
                          std::string_view expected, char const *context)
{
    if (response.result() != expected)
    {
        throw std::runtime_error(std::string(context) + ": expected result \"" +
                                 std::string(expected) + "\"");
    }
}

inline void expect_argument(ResponseView const &response, char const *key,
                            std::string_view expected)
{
    auto *value = response.argument(key);
    auto got = to_view(value);
    if (got != expected)
    {
        throw std::runtime_error(
            std::string("argument \"") + key + "\" was \"" + std::string(got) +
            "\" while \"" + std::string(expected) + "\" was expected");
    }
}

inline bool expect_bool_argument(ResponseView const &response, char const *key,
                                 bool expected)
{
    auto *value = response.argument(key);
    if (value == nullptr || !yyjson_is_bool(value))
    {
        throw std::runtime_error(std::string("argument \"") + key +
                                 "\" is not a bool");
    }
    bool actual = yyjson_get_bool(value);
    if (actual != expected)
    {
        throw std::runtime_error(std::string("argument \"") + key + "\" was " +
                                 (actual ? "true" : "false") + " instead of " +
                                 (expected ? "true" : "false"));
    }
    return actual;
}

} // namespace tt::tests
