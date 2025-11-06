#!/usr/bin/env node

import "dotenv/config";
import { Redis } from "ioredis";
import * as readline from "readline";

const config = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  db: parseInt(process.env.REDIS_DB || "0", 10),
};

const redis = new Redis(config);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function clearRedis(): Promise<void> {
  try {
    console.log("🧹 Redis Cleanup Tool\n");

    // Проверяем подключение
    const pong = await redis.ping();
    console.log(`✅ Redis подключен: ${pong}\n`);

    // Показываем текущие данные
    const chats = await redis.smembers("bot:chats");
    const allKeys = await redis.keys("*");

    console.log("📊 Текущее состояние:");
    console.log(`  Чатов: ${chats.length}`);
    console.log(`  Всего ключей: ${allKeys.length}\n`);

    // Выбор действия
    console.log("Что вы хотите удалить?");
    console.log("1. Всё (FLUSHDB)");
    console.log("2. Только данные бота (bot:*, chat:*, user:*)");
    console.log("3. Только очередь уведомлений (bull:notifications:*)");
    console.log("4. Конкретный чат");
    console.log("5. Отмена");

    const choice = await ask("\nВыберите действие (1-5): ");

    switch (choice.trim()) {
      case "1": {
        const confirm = await ask(
          "⚠️  ВНИМАНИЕ! Это удалит ВСЕ данные из Redis. Продолжить? (yes/no): "
        );
        if (confirm.toLowerCase() === "yes") {
          await redis.flushdb();
          console.log("✅ Все данные удалены");
        } else {
          console.log("❌ Отменено");
        }
        break;
      }

      case "2": {
        const patterns = ["bot:*", "chat:*", "user:*"];
        let totalDeleted = 0;

        for (const pattern of patterns) {
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
            totalDeleted += keys.length;
            console.log(
              `🗑️  Удалено ${keys.length} ключей по паттерну: ${pattern}`
            );
          }
        }

        console.log(`✅ Всего удалено ключей: ${totalDeleted}`);
        break;
      }

      case "3": {
        const keys = await redis.keys("bull:notifications:*");
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`🗑️  Удалено ${keys.length} ключей очереди`);
        } else {
          console.log("📭 Ключей очереди не найдено");
        }
        break;
      }

      case "4": {
        const chatId = await ask("Введите ID чата: ");
        const keysToDelete = [
          `chat:${chatId}:credentials`,
          `chat:${chatId}:schedule`,
        ];

        let deleted = 0;
        for (const key of keysToDelete) {
          const result = await redis.del(key);
          deleted += result;
        }

        await redis.srem("bot:chats", chatId);

        // Удаляем из списков пользователей
        const userKeys = await redis.keys("user:*:chats");
        for (const key of userKeys) {
          await redis.srem(key, chatId);
        }

        console.log(`✅ Чат ${chatId} удален (удалено ${deleted} ключей)`);
        break;
      }

      case "5":
        console.log("❌ Отменено");
        break;

      default:
        console.log("❌ Неверный выбор");
    }
  } catch (error) {
    console.error("❌ Ошибка:", (error as Error).message);
  } finally {
    rl.close();
    await redis.disconnect();
    console.log("\n🔌 Соединение с Redis закрыто");
  }
}

clearRedis();
