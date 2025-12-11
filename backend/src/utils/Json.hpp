#pragma once

#include <cstdlib>
#include <string>
#include <string_view>

#include <yyjson.h>

namespace tt::json {

class Document {
public:
  Document() = default;
  explicit Document(yyjson_doc *doc) : doc_(doc) {}
  Document(Document &&other) noexcept : doc_(other.doc_) { other.doc_ = nullptr; }
  Document &operator=(Document &&other) noexcept {
    if (this != &other) {
      reset();
      doc_ = other.doc_;
      other.doc_ = nullptr;
    }
    return *this;
  }
  Document(Document const &) = delete;
  Document &operator=(Document const &) = delete;

  ~Document() { reset(); }

  static Document parse(std::string_view payload) {
    return Document(
        yyjson_read(payload.data(), payload.size(), static_cast<yyjson_read_flag>(0)));
  }

  bool is_valid() const noexcept { return doc_ != nullptr; }
  yyjson_val *root() const noexcept {
    return doc_ ? yyjson_doc_get_root(doc_) : nullptr;
  }

private:
  void reset() {
    if (doc_) {
      yyjson_doc_free(doc_);
      doc_ = nullptr;
    }
  }

  yyjson_doc *doc_ = nullptr;
};

class MutableDocument {
public:
  MutableDocument() : doc_(yyjson_mut_doc_new(nullptr)) {}
  MutableDocument(MutableDocument &&other) noexcept : doc_(other.doc_) {
    other.doc_ = nullptr;
  }
  MutableDocument &operator=(MutableDocument &&other) noexcept {
    if (this != &other) {
      reset();
      doc_ = other.doc_;
      other.doc_ = nullptr;
    }
    return *this;
  }
  MutableDocument(MutableDocument const &) = delete;
  MutableDocument &operator=(MutableDocument const &) = delete;

  ~MutableDocument() { reset(); }

  bool is_valid() const noexcept { return doc_ != nullptr; }
  yyjson_mut_doc *doc() const noexcept { return doc_; }
  yyjson_mut_val *root() const noexcept {
    return doc_ ? yyjson_mut_doc_get_root(doc_) : nullptr;
  }

  void set_root(yyjson_mut_val *value) {
    if (doc_) {
      yyjson_mut_doc_set_root(doc_, value);
    }
  }

  std::string write(char const *fallback = "{}") const {
    if (!doc_) {
      return fallback ? fallback : "{}";
    }
    char *json = yyjson_mut_write(doc_, 0, nullptr);
    std::string result = json ? json : (fallback ? fallback : "{}");
    std::free(json);
    return result;
  }

private:
  void reset() {
    if (doc_) {
      yyjson_mut_doc_free(doc_);
      doc_ = nullptr;
    }
  }

  yyjson_mut_doc *doc_ = nullptr;
};

} // namespace tt::json
