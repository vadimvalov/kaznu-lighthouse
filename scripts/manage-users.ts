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

const command = process.argv[2];
const userId = process.argv[3];

async function showHelp(): Promise<void> {
  console.log(`
🔧 Управление пользователями Redis

Использование:
  node scripts/manage-users.js <команда> [user_id]

Команды:
  list                    - Показать всех пользователей
  add <user_id>           - Добавить пользователя
  remove <user_id>        - Удалить пользователя
  check <user_id>         - Проверить существование пользователя
  count                   - Показать количество пользователей
  clear                   - Удалить всех пользователей
  help                    - Показать эту справку

Примеры:
  node scripts/manage-users.js list
  node scripts/manage-users.js add 123456789
  node scripts/manage-users.js remove 123456789
  node scripts/manage-users.js check 123456789
`);
}

async function listUsers(): Promise<void> {
  try {
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
  } catch (error) {
    console.error("❌ Ошибка при получении списка:", (error as Error).message);
  }
}

async function addUser(userId: string | undefined): Promise<void> {
  if (!userId) {
    console.error("❌ Укажите ID пользователя");
    return;
  }

  try {
    const exists = await redis.sismember("bot:users", userId);
    if (exists) {
      console.log(`⚠️  Пользователь ${userId} уже существует`);
    } else {
      await redis.sadd("bot:users", userId);
      console.log(`✅ Пользователь ${userId} добавлен`);
    }
  } catch (error) {
    console.error("❌ Ошибка при добавлении:", (error as Error).message);
  }
}

async function removeUser(userId: string | undefined): Promise<void> {
  if (!userId) {
    console.error("❌ Укажите ID пользователя");
    return;
  }

  try {
    const exists = await redis.sismember("bot:users", userId);
    if (!exists) {
      console.log(`⚠️  Пользователь ${userId} не найден`);
    } else {
      await redis.srem("bot:users", userId);
      console.log(`✅ Пользователь ${userId} удален`);
    }
  } catch (error) {
    console.error("❌ Ошибка при удалении:", (error as Error).message);
  }
}

async function checkUser(userId: string | undefined): Promise<void> {
  if (!userId) {
    console.error("❌ Укажите ID пользователя");
    return;
  }

  try {
    const exists = await redis.sismember("bot:users", userId);
    if (exists) {
      console.log(`✅ Пользователь ${userId} найден`);
    } else {
      console.log(`❌ Пользователь ${userId} не найден`);
    }
  } catch (error) {
    console.error("❌ Ошибка при проверке:", (error as Error).message);
  }
}

async function countUsers(): Promise<void> {
  try {
    const count = await redis.scard("bot:users");
    console.log(`📊 Количество пользователей: ${count}`);
  } catch (error) {
    console.error("❌ Ошибка при подсчете:", (error as Error).message);
  }
}

async function clearUsers(): Promise<void> {
  try {
    const count = await redis.scard("bot:users");
    if (count === 0) {
      console.log("📭 Список пользователей уже пуст");
    } else {
      await redis.del("bot:users");
      console.log(`🗑️  Удалено ${count} пользователей`);
    }
  } catch (error) {
    console.error("❌ Ошибка при очистке:", (error as Error).message);
  }
}

async function main(): Promise<void> {
  try {
    switch (command) {
      case "list":
        await listUsers();
        break;
      case "add":
        await addUser(userId);
        break;
      case "remove":
        await removeUser(userId);
        break;
      case "check":
        await checkUser(userId);
        break;
      case "count":
        await countUsers();
        break;
      case "clear":
        await clearUsers();
        break;
      case "help":
      default:
        await showHelp();
        break;
    }
  } catch (error) {
    console.error("❌ Общая ошибка:", (error as Error).message);
  } finally {
    await redis.disconnect();
  }
}

main();

