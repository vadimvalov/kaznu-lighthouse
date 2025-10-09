#!/usr/bin/env node

import { Redis } from "ioredis";
import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  db: parseInt(process.env.REDIS_DB || "0", 10),
});

async function clearRedis(): Promise<void> {
  try {
    console.log("🧹 Очищаем Redis...\n");

    // Проверяем подключение
    const pong = await redis.ping();
    console.log(`✅ Redis подключен: ${pong}\n`);

    // Удаляем старые ключи
    const keysToDelete: string[] = ["bot:users", "bull:notifications:*"];

    for (const pattern of keysToDelete) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        console.log(
          `🗑️  Удаляем ${keys.length} ключей по паттерну: ${pattern}`
        );
        await redis.del(...keys);
      }
    }

    console.log("✅ Очистка завершена!");
  } catch (error) {
    console.error("❌ Ошибка:", (error as Error).message);
  } finally {
    await redis.disconnect();
    console.log("\n🔌 Соединение с Redis закрыто");
  }
}

clearRedis();
