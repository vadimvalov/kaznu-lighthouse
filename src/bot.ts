import { Bot } from "grammy";
import { config } from "dotenv";

// Load environment variables from .env file
config();

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.on("message", (ctx) => ctx.reply("Got another message!"));

bot.start();
