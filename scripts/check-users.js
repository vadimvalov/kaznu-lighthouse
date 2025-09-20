#!/usr/bin/env node

import { Redis } from "ioredis";
import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0", 10),
});

async function checkUsers() {
  try {
    console.log("🔍 Проверяем чаты в Redis...\n");

    // Проверяем подключение
    const pong = await redis.ping();
    console.log(`✅ Redis подключен: ${pong}\n`);

    // Получаем все чаты
    const chats = await redis.smembers("bot:chats");

    if (chats.length === 0) {
      console.log("📭 Список чатов пуст");
    } else {
      console.log(`👥 Найдено чатов: ${chats.length}`);
      console.log("📋 Список чатов:");
      chats.forEach((chatId, index) => {
        console.log(`  ${index + 1}. ID: ${chatId}`);
      });
    }

    // Показываем все ключи в Redis
    console.log("\n🔑 Все ключи в Redis:");
    const keys = await redis.keys("*");
    if (keys.length === 0) {
      console.log("  (ключей не найдено)");
    } else {
      keys.forEach((key, index) => {
        console.log(`  ${index + 1}. ${key}`);
      });
    }

    // Показываем информацию о ключе "bot:chats"
    if (keys.includes("bot:chats")) {
      console.log("\n📊 Информация о ключе 'bot:chats':");
      const chatCount = await redis.scard("bot:chats");
      const chatType = await redis.type("bot:chats");
      console.log(`  Тип: ${chatType}`);
      console.log(`  Количество элементов: ${chatCount}`);
    }
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  } finally {
    await redis.disconnect();
    console.log("\n🔌 Соединение с Redis закрыто");
  }
}

checkUsers();
