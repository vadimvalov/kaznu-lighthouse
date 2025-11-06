#!/usr/bin/env node

import "dotenv/config";
import { Redis } from "ioredis";

const config = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  db: parseInt(process.env.REDIS_DB || "0", 10),
};

const redis = new Redis(config);

async function checkUsers(): Promise<void> {
  try {
    console.log("🔍 Проверяем чаты в Redis...\n");

    // Проверяем подключение
    const pong = await redis.ping();
    console.log(`✅ Redis подключен: ${pong}\n`);

    // Получаем все чаты с credentials (из ключей chat:*:credentials)
    const credentialKeys = await redis.keys("chat:*:credentials");
    const chats: string[] = [];

    credentialKeys.forEach((key) => {
      const match = key.match(/^chat:(-?\d+):credentials$/);
      if (match && match[1]) {
        chats.push(match[1]);
      }
    });

    if (chats.length === 0) {
      console.log("📭 Список чатов пуст");
    } else {
      console.log(`👥 Найдено чатов: ${chats.length}`);
      console.log("\n📋 Список чатов:");

      for (const chatId of chats) {
        console.log(`\n  Chat ID: ${chatId}`);

        // Проверяем credentials
        const credKey = `chat:${chatId}:credentials`;
        const credData = await redis.get(credKey);

        if (credData) {
          const creds = JSON.parse(credData);
          console.log(`    👤 Username: ${creds.username}`);
          console.log(`    🔧 Setup by: ${creds.setupBy}`);
        }

        // Проверяем расписание
        const schedKey = `chat:${chatId}:schedule`;
        const schedData = await redis.get(schedKey);

        if (schedData) {
          const schedule = JSON.parse(schedData);
          const days = Object.keys(schedule);
          console.log(
            `    📅 Schedule: ${days.length} days (${days.join(", ")})`
          );
        } else {
          console.log(`    📅 Schedule: Not found`);
        }
      }
    }

    // Показываем все ключи в Redis
    console.log("\n🔑 Все ключи в Redis:");
    const keys = await redis.keys("*");
    if (keys.length === 0) {
      console.log("  (ключей не найдено)");
    } else {
      const grouped: Record<string, number> = {};

      keys.forEach((key) => {
        const prefix = key.split(":")[0] || "other";
        grouped[prefix] = (grouped[prefix] || 0) + 1;
      });

      console.log("\n  По типам:");
      Object.entries(grouped).forEach(([prefix, count]) => {
        console.log(`    ${prefix}: ${count} keys`);
      });

      console.log(`\n  Всего: ${keys.length} keys`);
    }
  } catch (error) {
    console.error("❌ Ошибка:", (error as Error).message);
  } finally {
    await redis.disconnect();
    console.log("\n🔌 Соединение с Redis закрыто");
  }
}

checkUsers();
