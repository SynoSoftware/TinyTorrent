#pragma once

#include <any>
#include <functional>

#include <memory>
#include <shared_mutex>
#include <typeindex>
#include <typeinfo>
#include <unordered_map>
#include <vector>

namespace tt::engine
{

class EventBus
{
  public:
    template <typename T> using Handler = std::function<void(T const &)>;

    template <typename T> void subscribe(Handler<T> handler)
    {
        std::unique_lock lock(handlers_mutex_);
        auto &entry = handlers_[std::type_index(typeid(T))];
        auto updated =
            entry ? std::make_shared<std::vector<TypeErasedHandler>>(*entry)
                  : std::make_shared<std::vector<TypeErasedHandler>>();
        updated->push_back([handler](std::any const &event)
                           { handler(std::any_cast<T const &>(event)); });
        entry = std::move(updated);
    }

    template <typename T> void publish(T const &event) const
    {
        std::shared_ptr<std::vector<TypeErasedHandler>> handlers_copy;
        {
            std::shared_lock lock(handlers_mutex_);
            auto it = handlers_.find(std::type_index(typeid(T)));
            if (it != handlers_.end())
            {
                handlers_copy = it->second;
            }
        }

        if (!handlers_copy)
            return;

        for (auto const &handler : *handlers_copy)
        {
            handler(event);
        }
    }

  private:
    using TypeErasedHandler = std::function<void(std::any const &)>;
    std::unordered_map<std::type_index,
                       std::shared_ptr<std::vector<TypeErasedHandler>>>
        handlers_;
    mutable std::shared_mutex handlers_mutex_;
};

} // namespace tt::engine