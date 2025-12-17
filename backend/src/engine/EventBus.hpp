#pragma once

#include <any>
#include <functional>
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
        auto &handlers = handlers_[std::type_index(typeid(T))];
        handlers.push_back([handler](std::any const &event)
                           { handler(std::any_cast<T const &>(event)); });
    }

    template <typename T> void publish(T const &event) const
    {
        // Copy handlers locally to avoid holding the lock during execution.
        // This prevents deadlocks if a handler calls subscribe() or acquires
        // other locks.
        std::vector<TypeErasedHandler> handlers_copy;
        {
            std::shared_lock lock(handlers_mutex_);
            auto it = handlers_.find(std::type_index(typeid(T)));
            if (it != handlers_.end())
            {
                handlers_copy = it->second;
            }
        }

        for (auto const &handler : handlers_copy)
        {
            handler(event);
        }
    }

  private:
    using TypeErasedHandler = std::function<void(std::any const &)>;
    std::unordered_map<std::type_index, std::vector<TypeErasedHandler>>
        handlers_;
    mutable std::shared_mutex handlers_mutex_;
};

} // namespace tt::engine