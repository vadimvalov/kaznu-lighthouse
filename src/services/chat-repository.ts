import { Redis } from "ioredis";
import type { ScheduleType } from "./lib/types.js";

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

  async getCurrentSchedule(): Promise<ScheduleType> {
    const schedule = await this.redis.get("bot:current_schedule");
    return (schedule as ScheduleType) || "schedule_1";
  }

  async setCurrentSchedule(schedule: ScheduleType): Promise<void> {
    await this.redis.set("bot:current_schedule", schedule);
  }
}
