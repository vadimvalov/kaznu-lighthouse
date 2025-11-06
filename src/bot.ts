import "dotenv/config";
import { Bot } from "grammy";
import cron from "node-cron";
import { NotificationService } from "./services/notificationService.js";
import { ChatRepository } from "./services/chat-repository.js";
import { CredentialsRepository } from "./services/credentialsRepository.js";
import { SettingsHandler } from "./services/settingsHandler.js";

const bot = new Bot(process.env.BOT_TOKEN!);
const chatRepository = new ChatRepository();
const credentialsRepo = new CredentialsRepository();

bot.command("ping", async (ctx) => {
  await ctx.reply("pong");
});

const service = new NotificationService(bot, chatRepository, credentialsRepo);
new SettingsHandler(bot, credentialsRepo);

bot.on("my_chat_member", async (ctx) => {
  const update = ctx.myChatMember;
  const chatId = ctx.chat?.id;

  if (!update || !chatId) {
    console.error("Missing update or chat ID in my_chat_member event");
    return;
  }

  if (update.new_chat_member.status === "member") {
    await chatRepository.addChat(chatId);
    await ctx.reply(
      "👋 Hello everyone! I'll help you not miss your lessons!\n\n" +
        "To get started, an administrator should use the /settings command."
    );
  } else if (
    update.new_chat_member.status === "left" ||
    update.new_chat_member.status === "kicked"
  ) {
    await chatRepository.removeChat(String(chatId));
    await credentialsRepo.removeChat(chatId);
  }
});

cron.schedule(
  "55 6 * * *",
  async () => {
    await service.updateAllSchedules();
  },
  { timezone: "Asia/Almaty" }
);

cron.schedule(
  "0 7 * * *",
  async () => {
    await service.scheduleDailyMessage();
  },
  { timezone: "Asia/Almaty" }
);

cron.schedule(
  "0 7 * * *",
  async () => {
    await service.scheduleLessonsMessages();
  },
  { timezone: "Asia/Almaty" }
);

process.on("SIGINT", async () => {
  await credentialsRepo.disconnect();
  bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await credentialsRepo.disconnect();
  bot.stop();
  process.exit(0);
});

bot.start();
console.log("🤖 Bot started successfully!");
console.log("📋 Available commands:");
console.log("  /settings - Configure bot (group chat, admins only)");
console.log("  /ping - Check if bot is alive");
console.log("\n⏰ Scheduled tasks:");
console.log("  06:55 - Update schedules");
console.log("  07:00 - Send daily messages & schedule lesson notifications");
console.log("Check this logs, esli chto-to ebnulos'- budet ponyatno");
