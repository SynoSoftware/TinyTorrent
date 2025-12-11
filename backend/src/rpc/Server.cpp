#include "rpc/Server.hpp"

#include "rpc/Serializer.hpp"
#include "utils/Log.hpp"
#include "vendor/mongoose.h"

#include <array>
#include <cctype>
#include <chrono>
#include <limits>
#include <random>
#include <string>
#include <string_view>
#include <vector>

namespace {
constexpr char kSessionHeaderName[] = "X-Transmission-Session-Id";

std::string generate_session_id() {
  static constexpr char kHexDigits[] = "0123456789abcdef";
  std::mt19937_64 rng(static_cast<std::uint64_t>(
      std::chrono::high_resolution_clock::now().time_since_epoch().count()));
  std::uniform_int_distribution<std::uint64_t> dist;
  std::string token;
  token.reserve(32);
  while (token.size() < 32) {
    auto value = dist(rng);
    for (int bit = 0; bit < 16 && token.size() < 32; ++bit) {
      token.push_back(kHexDigits[value & 0xF]);
      value >>= 4;
    }
  }
  return token;
}

std::optional<std::vector<std::uint8_t>> decode_base64(std::string_view input) {
  static constexpr char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  static const std::array<int8_t, 256> kLookup = [] {
    std::array<int8_t, 256> table{};
    table.fill(-1);
    for (int i = 0; kAlphabet[i] != '\0'; ++i) {
      table[static_cast<std::size_t>(kAlphabet[i])] =
          static_cast<int8_t>(i);
    }
    return table;
  }();

  std::vector<std::uint8_t> result;
  result.reserve((input.size() * 3) / 4);
  unsigned buffer = 0;
  int bits_collected = 0;
  for (char ch : input) {
    if (std::isspace(static_cast<unsigned char>(ch))) {
      continue;
    }
    if (ch == '=') {
      break;
    }
    auto value = kLookup[static_cast<unsigned char>(ch)];
    if (value < 0) {
      return std::nullopt;
    }
    buffer = (buffer << 6) | static_cast<unsigned>(value);
    bits_collected += 6;
    if (bits_collected >= 8) {
      bits_collected -= 8;
      result.push_back(
          static_cast<std::uint8_t>((buffer >> bits_collected) & 0xFF));
    }
  }
  return result;
}

std::optional<std::string> decode_basic_credentials(std::string_view header) {
  static constexpr std::string_view prefix = "Basic ";
  if (!header.starts_with(prefix)) {
    return std::nullopt;
  }
  auto payload = header.substr(prefix.size());
  auto decoded = decode_base64(payload);
  if (!decoded) {
    return std::nullopt;
  }
  return std::string(decoded->begin(), decoded->end());
}

} // namespace

namespace tt::rpc {

Server::Server(engine::Core *engine, std::string bind_url, ServerOptions options)
    : bind_url_(std::move(bind_url)),
      rpc_path_("/transmission/rpc"),
      engine_(engine),
      dispatcher_(engine, bind_url_),
      listener_(nullptr),
      session_id_(generate_session_id()),
      options_(std::move(options)) {
  mg_mgr_init(&mgr_);
  mgr_.userdata = this;
}

Server::~Server() {
  stop();
  mg_mgr_free(&mgr_);
}

void Server::start() {
  if (running_.exchange(true)) {
    return;
  }

  listener_ = mg_http_listen(&mgr_, bind_url_.c_str(), &Server::handle_event,
                             this);
  if (listener_ == nullptr) {
    TT_LOG_INFO("Failed to bind RPC listener to {}", bind_url_);
  } else {
    TT_LOG_INFO("RPC listener bound to {}, exposing {}", bind_url_,
                rpc_path_);
  }
  worker_ = std::thread(&Server::run_loop, this);
  TT_LOG_INFO("RPC worker thread started");
}

void Server::stop() {
  if (!running_.exchange(false)) {
    return;
  }

  TT_LOG_INFO("Stopping RPC worker thread");
  if (worker_.joinable()) {
    worker_.join();
  }
}

void Server::run_loop() {
  while (running_.load(std::memory_order_relaxed)) {
    //TT_LOG_DEBUG("Polling Mongoose event loop");
    mg_mgr_poll(&mgr_, 50);
  }
}

std::string Server::dispatch(std::string_view payload) {
  return dispatcher_.dispatch(payload);
}

bool Server::authorize_request(struct mg_http_message *hm) {
  if (!options_.basic_auth && !options_.token) {
    return true;
  }
  if (options_.token) {
    auto const &token = *options_.token;
    if (auto *header = mg_http_get_header(hm, options_.token_header.c_str());
        header != nullptr) {
      std::string_view value(header->buf, header->len);
      if (value == token) {
        return true;
      }
    }
    if (auto *header = mg_http_get_header(hm, "Authorization"); header != nullptr) {
      std::string_view value(header->buf, header->len);
      static constexpr std::string_view bearer = "Bearer ";
      if (value.size() > bearer.size() && value.starts_with(bearer)) {
        auto token_value = value.substr(bearer.size());
        if (token_value == token) {
          return true;
        }
      }
    }
  }
  if (options_.basic_auth) {
    if (auto *header = mg_http_get_header(hm, "Authorization"); header != nullptr) {
      if (auto credentials =
              decode_basic_credentials(std::string_view(header->buf, header->len))) {
        auto expected =
            options_.basic_auth->first + ":" + options_.basic_auth->second;
        if (*credentials == expected) {
          return true;
        }
      }
    }
  }
  return false;
}

void Server::handle_event(struct mg_connection *conn, int ev, void *ev_data) {
  if (ev != MG_EV_HTTP_MSG) {
    return;
  }

  if (conn == nullptr) {
    return;
  }

  auto *self = static_cast<Server *>(conn->fn_data);
  if (self == nullptr) {
    return;
  }

  auto *hm = static_cast<struct mg_http_message *>(ev_data);
  std::string_view uri(hm->uri.buf, hm->uri.len);
  std::string_view method(hm->method.buf, hm->method.len);
  TT_LOG_DEBUG("RPC request {} {}", method, uri);
  if (uri.size() != self->rpc_path_.size() ||
      std::memcmp(uri.data(), self->rpc_path_.data(), uri.size()) != 0) {
    TT_LOG_INFO("RPC request rejected; unsupported path {}", uri);
    mg_http_reply(conn, 404, "Content-Type: text/plain\r\n", "not found");
    return;
  }

  if (!self->authorize_request(hm)) {
    std::string headers = "Content-Type: text/plain\r\n";
    if (self->options_.basic_auth) {
      headers += "WWW-Authenticate: Basic realm=\"";
      headers += self->options_.basic_realm;
      headers += "\"\r\n";
    }
    mg_http_reply(conn, 401, headers.c_str(), "unauthorized");
    return;
  }

  auto *session_header = mg_http_get_header(hm, kSessionHeaderName);
  bool session_ok = session_header != nullptr &&
                    static_cast<std::size_t>(session_header->len) ==
                        self->session_id_.size() &&
                    std::memcmp(session_header->buf, self->session_id_.data(),
                                self->session_id_.size()) == 0;
  if (!session_ok) {
    std::string headers = std::string("Content-Type: application/json\r\n") +
                          kSessionHeaderName + ": " + self->session_id_ +
                          "\r\n";
    auto payload = serialize_error("session id required");
    mg_http_reply(conn, 409, headers.c_str(), "%s", payload.c_str());
    return;
  }

  std::string body;
  if (hm->body.len > 0 && hm->body.buf != nullptr) {
    body.assign(hm->body.buf, hm->body.len);
  }
  auto payload = self->dispatch(body);
  mg_http_reply(conn, 200, "Content-Type: application/json\r\n", "%s", payload.c_str());
}

} // namespace tt::rpc
