#!/bin/bash

# Скрипт для запуска Redis сервера

echo "Проверяем статус Redis..."

# Проверяем, запущен ли Redis
if pgrep -x "redis-server" > /dev/null; then
    echo "Redis уже запущен"
else
    echo "Запускаем Redis сервер..."
    
    # Попробуем запустить Redis
    if command -v redis-server &> /dev/null; then
        redis-server --daemonize yes
        echo "Redis запущен в фоновом режиме"
    else
        echo "Redis не установлен. Установите Redis:"
        echo "macOS: brew install redis"
        echo "Ubuntu/Debian: sudo apt-get install redis-server"
        exit 1
    fi
fi

echo "Redis готов к работе!"
