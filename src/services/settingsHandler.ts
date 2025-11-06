import { Bot, InlineKeyboard } from "grammy";
import { CredentialsRepository } from "./credentialsRepository.js";
import { scheduleScrapper } from "./scheduleScrapper.js";

interface ConversationState {
  step: "waiting_username" | "waiting_password";
  chatId: number;
  userId: number;
  username?: string;
  isReconfigure?: boolean;
}

export class SettingsHandler {
  private bot: Bot;
  private credentialsRepo: CredentialsRepository;
  private conversations: Map<number, ConversationState> = new Map();
  private readonly beggarMessage =
    'I would be happy if you star this project on <a href="https://github.com/vadimvalov/kaznu-lighthouse">GitHub</a>';

  constructor(bot: Bot, credentialsRepo: CredentialsRepository) {
    this.bot = bot;
    this.credentialsRepo = credentialsRepo;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.command("settings", async (ctx) => {
      if (ctx.chat.type === "private") {
        await ctx.reply(
          "❌ This command should be used in a group chat where the bot is added."
        );
        return;
      }

      const userId = ctx.from?.id;
      if (!userId) return;

      const member = await ctx.getChatMember(userId);
      if (member.status !== "administrator" && member.status !== "creator") {
        await ctx.reply(
          "❌ Only administrators can configure the bot settings."
        );
        return;
      }

      const chatId = ctx.chat.id;
      const isConfigured = await this.credentialsRepo.isConfigured(chatId);
      const username = ctx.from?.username ? `@${ctx.from.username}` : "User";

      await ctx.reply(
        `✅ ${username}, check your private messages to configure the bot!`
      );

      try {
        if (isConfigured) {
          const keyboard = new InlineKeyboard()
            .text("🗑️ Delete settings", `settings_delete_${chatId}`)
            .text("⚙️ Reconfigure", `settings_reconfigure_${chatId}`)
            .row();

          await this.bot.api.sendMessage(
            userId,
            "⚙️ Bot is already configured for this chat.\n\n" +
              "Choose an action:",
            { reply_markup: keyboard }
          );
        } else {
          const cancelKeyboard = new InlineKeyboard()
            .text("❌ Cancel", `cancel_setup_${userId}`)
            .row();

          await this.bot.api.sendMessage(
            userId,
            "👋 Let's set up the bot for your group!\n\n" +
              "I need your KazNU credentials to fetch your schedule.\n\n" +
              "📝 Please enter your username:",
            { reply_markup: cancelKeyboard }
          );

          this.conversations.set(userId, {
            step: "waiting_username",
            chatId: ctx.chat.id,
            userId: userId,
          });
        }
      } catch (error) {
        await ctx.reply(
          "❌ I couldn't send you a private message. Please start a chat with me first by clicking @" +
            ctx.me.username
        );
      }
    });

    this.bot.callbackQuery(/^cancel_setup_(\d+)$/, async (ctx) => {
      const match = ctx.match;
      if (!match || !match[1]) return;

      const userId = parseInt(match[1]);
      const currentUserId = ctx.from?.id;

      if (!currentUserId || currentUserId !== userId) {
        await ctx.answerCallbackQuery({
          text: "❌ You can only cancel your own setup",
          show_alert: true,
        });
        return;
      }

      const state = this.conversations.get(userId);

      if (!state) {
        await ctx.answerCallbackQuery({
          text: "❌ Setup already cancelled or completed",
        });
        return;
      }

      const chatId = state.chatId;
      this.conversations.delete(userId);
      await ctx.answerCallbackQuery({
        text: "✅ Setup cancelled",
      });

      const isConfigured = await this.credentialsRepo.isConfigured(chatId);
      if (isConfigured) {
        const keyboard = new InlineKeyboard()
          .text("🗑️ Delete settings", `settings_delete_${chatId}`)
          .text("⚙️ Reconfigure", `settings_reconfigure_${chatId}`)
          .row();

        await ctx.editMessageText(
          "⚙️ Bot is already configured for this chat.\n\n" +
            "Choose an action:",
          { reply_markup: keyboard }
        );
      } else {
        await ctx.editMessageText("❌ Setup cancelled.");
      }
    });

    this.bot.callbackQuery(/^confirm_delete_(-?\d+)$/, async (ctx) => {
      const match = ctx.match;
      if (!match || !match[1]) return;

      const chatId = parseInt(match[1]);
      const userId = ctx.from?.id;

      if (!userId) return;

      // Check administrator rights
      try {
        const member = await ctx.api.getChatMember(chatId, userId);
        if (member.status !== "administrator" && member.status !== "creator") {
          await ctx.answerCallbackQuery({
            text: "❌ Only administrators can delete settings",
            show_alert: true,
          });
          return;
        }
      } catch (error) {
        await ctx.answerCallbackQuery({
          text: "❌ Error checking access rights",
          show_alert: true,
        });
        return;
      }

      await this.credentialsRepo.removeChat(chatId);
      await ctx.answerCallbackQuery({
        text: "✅ Configuration deleted",
      });
      await ctx.editMessageText(
        "✅ Settings are deleted, credentials aren't stored anymore"
      );

      // Send message to group chat
      try {
        await this.bot.api.sendMessage(
          chatId,
          "Configuration has been deleted, I would not bother you anymore :c"
        );
      } catch (error) {
        console.error("Failed to send deletion message to group:", error);
      }
    });

    this.bot.callbackQuery(/^cancel_delete_(-?\d+)$/, async (ctx) => {
      const match = ctx.match;
      if (!match || !match[1]) return;

      const chatId = parseInt(match[1]);
      const userId = ctx.from?.id;

      if (!userId) return;

      // Check administrator rights
      try {
        const member = await ctx.api.getChatMember(chatId, userId);
        if (member.status !== "administrator" && member.status !== "creator") {
          await ctx.answerCallbackQuery({
            text: "❌ Only administrators can change settings",
            show_alert: true,
          });
          return;
        }
      } catch (error) {
        await ctx.answerCallbackQuery({
          text: "❌ Error checking access rights",
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery({
        text: "✅ Deletion cancelled",
      });

      const keyboard = new InlineKeyboard()
        .text("🗑️ Delete settings", `settings_delete_${chatId}`)
        .text("⚙️ Reconfigure", `settings_reconfigure_${chatId}`)
        .row();

      await ctx.editMessageText(
        "⚙️ Bot is already configured for this chat.\n\n" + "Choose an action:",
        { reply_markup: keyboard }
      );
    });

    this.bot.callbackQuery(
      /^settings_(delete|reconfigure)_(-?\d+)$/,
      async (ctx) => {
        const match = ctx.match;
        if (!match || !match[1] || !match[2]) return;

        const action = match[1];
        const chatId = parseInt(match[2]);
        const userId = ctx.from?.id;

        if (!userId) return;

        // Check administrator rights
        try {
          const member = await ctx.api.getChatMember(chatId, userId);
          if (
            member.status !== "administrator" &&
            member.status !== "creator"
          ) {
            await ctx.answerCallbackQuery({
              text: "❌ Only administrators can change settings",
              show_alert: true,
            });
            return;
          }
        } catch (error) {
          await ctx.answerCallbackQuery({
            text: "❌ Error checking access rights",
            show_alert: true,
          });
          return;
        }

        if (action === "delete") {
          await ctx.answerCallbackQuery();

          const confirmKeyboard = new InlineKeyboard()
            .text("✅ Yes", `confirm_delete_${chatId}`)
            .text("❌ No", `cancel_delete_${chatId}`)
            .row();

          await ctx.editMessageText(
            "⚠️ Are you sure you want to delete the configuration?\n\n" +
              "This will remove all stored credentials and schedule data.",
            { reply_markup: confirmKeyboard }
          );
        } else if (action === "reconfigure") {
          await ctx.answerCallbackQuery();

          try {
            const cancelKeyboard = new InlineKeyboard()
              .text("❌ Cancel", `cancel_setup_${userId}`)
              .row();

            await ctx.editMessageText(
              "👋 Let's reconfigure the bot for your group!\n\n" +
                "I need your KazNU credentials to fetch your schedule.\n\n" +
                "📝 Please enter your username:",
              { reply_markup: cancelKeyboard }
            );

            this.conversations.set(userId, {
              step: "waiting_username",
              chatId: chatId,
              userId: userId,
              isReconfigure: true,
            });
          } catch (error) {
            await ctx.api.sendMessage(
              chatId,
              "❌ I couldn't send you a private message. Please start a chat with me first by clicking @" +
                ctx.me.username
            );
          }
        }
      }
    );

    this.bot.on("message:text", async (ctx) => {
      if (ctx.chat.type !== "private") return;

      const userId = ctx.from.id;
      const state = this.conversations.get(userId);

      if (!state) return;

      if (state.step === "waiting_username") {
        const username = ctx.message.text;

        try {
          await ctx.deleteMessage();
        } catch (e) {}

        const cancelKeyboard = new InlineKeyboard()
          .text("❌ Cancel", `cancel_setup_${userId}`)
          .row();

        await ctx.reply(
          "✅ Username saved!\n\n🔒 Now please enter your password:",
          { reply_markup: cancelKeyboard }
        );

        this.conversations.set(userId, {
          ...state,
          step: "waiting_password",
          username: username,
        });
      } else if (state.step === "waiting_password") {
        const password = ctx.message.text;

        try {
          await ctx.deleteMessage();
        } catch (e) {}

        await ctx.reply(
          "⏳ Verifying your credentials and fetching schedule..."
        );

        const result = await scheduleScrapper({
          username: state.username!,
          password: password,
        });

        if (!result.success) {
          const cancelKeyboard = new InlineKeyboard()
            .text("❌ Cancel", `cancel_setup_${userId}`)
            .row();

          await ctx.reply(
            `❌ Failed to verify credentials: ${result.error}\n\n` +
              "Please check your credentials and try again.\n\n" +
              "Send your username to restart the setup:",
            { reply_markup: cancelKeyboard }
          );

          this.conversations.set(userId, {
            step: "waiting_username",
            chatId: state.chatId,
            userId: userId,
            isReconfigure: state.isReconfigure,
          });
          return;
        }

        await this.credentialsRepo.saveCredentials(state.chatId, {
          username: state.username!,
          password: password,
          userId: userId,
          setupBy: userId,
        });

        await this.credentialsRepo.saveSchedule(state.chatId, result.schedule!);

        const isReconfigure = state.isReconfigure || false;
        const successMessage = isReconfigure
          ? "✅ Bot reconfigured successfully!"
          : "✅ Bot configured successfully!";

        await ctx.reply(
          `${successMessage}\n\n` +
            "📅 Your schedule has been fetched and saved.\n" +
            "🔔 You will receive notifications at:\n" +
            "  • 7:00 AM - Daily schedule\n" +
            "  • 1 hour before first lesson\n" +
            "  • 10 minutes before other lessons\n\n" +
            "Schedule will be automatically updated every day at 6:55 AM."
        );

        try {
          const groupMessage = isReconfigure
            ? "✅ Bot has been reconfigured successfully! 🎉\n\n" +
              "I will send schedule notifications starting from tomorrow.\n\n" +
              this.beggarMessage
            : "✅ Bot has been configured successfully! 🎉\n\n" +
              "I will send schedule notifications starting from tomorrow.\n\n" +
              this.beggarMessage;

          await this.bot.api.sendMessage(state.chatId, groupMessage, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          });
        } catch (e) {
          console.error("Failed to send confirmation to group:", e);
        }

        this.conversations.delete(userId);
      }
    });
  }
}
