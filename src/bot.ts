import "dotenv/config";
import { Bot } from "grammy";
import cron from "node-cron";
import { NotificationService } from "./services/notificationService.js";
import { ChatRepository } from "./services/chat-repository.js";
import { scheduleScrapper } from "./services/scheduleScrapper.js";

const bot = new Bot(process.env.BOT_TOKEN!);
const chatRepository = new ChatRepository();
const service = new NotificationService(bot, chatRepository);

bot.command("ping", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("pong");
  }
});

bot.on("my_chat_member", async (ctx) => {
  const update = ctx.myChatMember;
  if (update) {
    if (update.new_chat_member.status === "member") {
      await chatRepository.addChat(ctx.chat?.id!);
      await ctx.reply("Хелоу всем, я буду помогать нам не просрать уроки!");
    } else if (
      update.new_chat_member.status === "left" ||
      update.new_chat_member.status === "kicked"
    ) {
      await chatRepository.removeChat(String(ctx.chat?.id));
    }
  }
});

cron.schedule(
  "59 6 * * *",
  async () => {
    await scheduleScrapper();
  },
  { timezone: "Asia/Almaty" }
);

cron.schedule("0 7 * * *", () => service.scheduleDailyMessage(), {
  timezone: "Asia/Almaty",
});

cron.schedule("0 7 * * *", () => service.scheduleLessonsMessages(), {
  timezone: "Asia/Almaty",
});

bot.start();
console.log(
  "🤖 Bot started successfully. At 7 am it would cron-schedule messages for the whole day"
);
