import { Redis } from "ioredis";

export class ChatRepository {
  private redis: Redis;

  constructor() {
    this.redis = new Redis();
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
}
