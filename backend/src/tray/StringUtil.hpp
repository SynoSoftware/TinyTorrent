#pragma once

#include <cstdio>
#include <string>
#include <string_view>
#include <windows.h>

inline std::wstring widen(std::string const &value)
{
    if (value.empty())
    {
        return {};
    }
    int len = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (len <= 0)
    {
        return {};
    }
    std::wstring out(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, out.data(), len);
    if (!out.empty() && out.back() == L'\0')
    {
        out.pop_back();
    }
    return out;
}

inline std::string narrow(std::wstring const &value)
{
    if (value.empty())
    {
        return {};
    }
    int len = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, nullptr, 0,
                                  nullptr, nullptr);
    if (len <= 0)
    {
        return {};
    }
    std::string out(len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(), -1, out.data(), len, nullptr,
                        nullptr);
    if (!out.empty() && out.back() == '\0')
    {
        out.pop_back();
    }
    return out;
}

inline std::string escape_json_string(std::string_view value)
{
    std::string result;
    result.reserve(value.size());
    for (unsigned char ch : value)
    {
        switch (ch)
        {
        case '\\':
            result += "\\\\";
            break;
        case '"':
            result += "\\\"";
            break;
        case '\n':
            result += "\\n";
            break;
        case '\r':
            result += "\\r";
            break;
        case '\t':
            result += "\\t";
            break;
        default:
            if (ch < 0x20)
            {
                char buf[7];
                snprintf(buf, sizeof(buf), "\\u%04x", ch);
                result += buf;
            }
            else
            {
                result += static_cast<char>(ch);
            }
            break;
        }
    }
    return result;
}
