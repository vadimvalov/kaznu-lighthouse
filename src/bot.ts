import "dotenv/config";
import { Bot } from "grammy";
import cron from "node-cron";
import { NotificationService } from "./services/notificationService.js";
import { UserRepository } from "./services/user-repository.js";

const bot = new Bot(process.env.BOT_TOKEN!);
const userRepository = new UserRepository();
const service = new NotificationService(bot, userRepository);

bot.command("start", async (ctx) => {
  if (ctx.from?.id) {
    await userRepository.addUser(ctx.from.id);
    await ctx.reply("✅ Вы подписаны на уведомления");
  }
});

cron.schedule("0 7 * * *", () => service.scheduleDailyMessage(), {
  timezone: "Asia/Almaty",
});

cron.schedule("*/1 * * * *", () => service.scheduleLessonsMessages(), {
  timezone: "Asia/Almaty",
});

bot.start();
console.log("🤖 Bot started successfully");
