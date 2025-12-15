#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace tt::utils
{

inline std::optional<std::vector<std::uint8_t>>
decode_base64(std::string_view input)
{
    static constexpr char const *kAlphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    static const std::array<int8_t, 256> kLookup = []
    {
        std::array<int8_t, 256> table{};
        table.fill(-1);
        for (int i = 0; kAlphabet[i] != '\0'; ++i)
        {
            table[static_cast<std::uint8_t>(kAlphabet[i])] =
                static_cast<int8_t>(i);
        }
        return table;
    }();

    std::vector<std::uint8_t> result;
    result.reserve((input.size() * 3) / 4);
    unsigned buffer = 0;
    int bits_collected = 0;
    for (char ch : input)
    {
        if (std::isspace(static_cast<unsigned char>(ch)))
        {
            continue;
        }
        if (ch == '=')
        {
            break;
        }
        auto value = kLookup[static_cast<std::uint8_t>(ch)];
        if (value < 0)
        {
            return std::nullopt;
        }
        buffer = (buffer << 6) | static_cast<unsigned>(value);
        bits_collected += 6;
        if (bits_collected >= 8)
        {
            bits_collected -= 8;
            result.push_back(
                static_cast<std::uint8_t>((buffer >> bits_collected) & 0xFF));
        }
    }
    return result;
}

inline std::string encode_base64(std::span<std::uint8_t const> data)
{
    static constexpr char const kAlphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string encoded;
    encoded.reserve(((data.size() + 2) / 3) * 4);
    unsigned buffer = 0;
    int bits_collected = 0;
    for (auto byte : data)
    {
        buffer = (buffer << 8) | static_cast<unsigned>(byte);
        bits_collected += 8;
        while (bits_collected >= 6)
        {
            bits_collected -= 6;
            encoded.push_back(kAlphabet[(buffer >> bits_collected) & 0x3F]);
        }
    }
    if (bits_collected > 0)
    {
        buffer <<= (6 - bits_collected);
        encoded.push_back(kAlphabet[buffer & 0x3F]);
    }
    while (encoded.size() % 4 != 0)
    {
        encoded.push_back('=');
    }
    return encoded;
}

} // namespace tt::utils
