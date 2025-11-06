import { Redis } from "ioredis";

export class ChatRepository {
  private redis: Redis;

  constructor() {
    const config = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      ...(process.env.REDIS_PASSWORD && {
        password: process.env.REDIS_PASSWORD,
      }),
      db: parseInt(process.env.REDIS_DB || "0", 10),
    };
    this.redis = new Redis(config);
  }

  async addChat(chatId: number): Promise<void> {
    await this.redis.sadd("bot:chats", chatId);
  }

  async getChats(): Promise<string[]> {
    return await this.redis.smembers("bot:chats");
  }

  async removeChat(chatId: string): Promise<void> {
    await this.redis.srem("bot:chats", chatId);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
