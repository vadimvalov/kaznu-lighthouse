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
    console.log("🔍 Проверяем пользователей в Redis...\n");

    // Проверяем подключение
    const pong = await redis.ping();
    console.log(`✅ Redis подключен: ${pong}\n`);

    // Получаем всех пользователей
    const users = await redis.smembers("bot:users");

    if (users.length === 0) {
      console.log("📭 Список пользователей пуст");
    } else {
      console.log(`👥 Найдено пользователей: ${users.length}`);
      console.log("📋 Список пользователей:");
      users.forEach((userId, index) => {
        console.log(`  ${index + 1}. ID: ${userId}`);
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

    // Показываем информацию о ключе "bot:users"
    if (keys.includes("bot:users")) {
      console.log("\n📊 Информация о ключе 'bot:users':");
      const userCount = await redis.scard("bot:users");
      const userType = await redis.type("bot:users");
      console.log(`  Тип: ${userType}`);
      console.log(`  Количество элементов: ${userCount}`);
    }
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  } finally {
    await redis.disconnect();
    console.log("\n🔌 Соединение с Redis закрыто");
  }
}

checkUsers();
