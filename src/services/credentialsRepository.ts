import { Redis } from "ioredis";
import { getRedisConfig } from "../config/redisConfig.js";

export interface UserCredentials {
  username: string;
  password: string;
  userId: number;
  setupBy: number; // кто настроил бота
}

export class CredentialsRepository {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(getRedisConfig());
  }

  /**
   * Сохранить credentials для чата
   */
  async saveCredentials(
    chatId: number,
    credentials: UserCredentials
  ): Promise<void> {
    const key = `chat:${chatId}:credentials`;
    await this.redis.set(key, JSON.stringify(credentials));

    // Добавляем чат в список чатов пользователя
    await this.redis.sadd(`user:${credentials.setupBy}:chats`, chatId);
  }

  /**
   * Получить credentials для чата
   */
  async getCredentials(chatId: number): Promise<UserCredentials | null> {
    const key = `chat:${chatId}:credentials`;
    const data = await this.redis.get(key);

    if (!data) return null;

    return JSON.parse(data) as UserCredentials;
  }

  /**
   * Сохранить расписание для чата
   */
  async saveSchedule(chatId: number, schedule: any): Promise<void> {
    const key = `chat:${chatId}:schedule`;
    await this.redis.set(key, JSON.stringify(schedule));
  }

  /**
   * Получить расписание для чата
   */
  async getSchedule(chatId: number): Promise<any | null> {
    const key = `chat:${chatId}:schedule`;
    const data = await this.redis.get(key);

    if (!data) return null;

    return JSON.parse(data);
  }

  /**
   * Сохранить расписание экзаменов для чата
   */
  async saveExamSchedule(chatId: number, exams: any[]): Promise<void> {
    const key = `chat:${chatId}:exams`;
    await this.redis.set(key, JSON.stringify(exams));
  }

  /**
   * Получить расписание экзаменов для чата
   */
  async getExamSchedule(chatId: number): Promise<any[] | null> {
    const key = `chat:${chatId}:exams`;
    const data = await this.redis.get(key);

    if (!data) return null;

    return JSON.parse(data);
  }

  /**
   * Проверить, настроен ли бот для чата
   */
  async isConfigured(chatId: number): Promise<boolean> {
    const credentials = await this.getCredentials(chatId);
    return credentials !== null;
  }

  /**
   * Удалить все данные чата
   */
  async removeChat(chatId: number): Promise<void> {
    const credentials = await this.getCredentials(chatId);

    if (credentials) {
      await this.redis.srem(`user:${credentials.setupBy}:chats`, chatId);
    }

    await this.redis.del(`chat:${chatId}:credentials`);
    await this.redis.del(`chat:${chatId}:schedule`);
  }

  /**
   * Получить все чаты пользователя
   */
  async getUserChats(userId: number): Promise<string[]> {
    return await this.redis.smembers(`user:${userId}:chats`);
  }

  /**
   * Получить все чаты с настроенными credentials
   */
  async getAllConfiguredChats(): Promise<string[]> {
    const credentialKeys = await this.redis.keys("chat:*:credentials");
    const chatIds = new Set<string>();

    credentialKeys.forEach((key) => {
      const match = key.match(/^chat:(-?\d+):credentials$/);
      if (match && match[1]) {
        chatIds.add(match[1]);
      }
    });

    return Array.from(chatIds);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
