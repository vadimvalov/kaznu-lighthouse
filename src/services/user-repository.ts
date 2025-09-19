import { Redis } from "ioredis";

export class UserRepository {
  private redis: Redis;

  constructor() {
    this.redis = new Redis();
  }

  async addUser(userId: number): Promise<void> {
    await this.redis.sadd("bot:users", userId);
  }

  async getUsers(): Promise<string[]> {
    return await this.redis.smembers("bot:users");
  }

  async removeUser(userId: string): Promise<void> {
    await this.redis.srem("bot:users", userId);
  }
}
