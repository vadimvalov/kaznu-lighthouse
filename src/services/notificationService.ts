import Queue from "bull";
import { Bot } from "grammy";
import { ChatRepository } from "./chat-repository.js";
import { CredentialsRepository } from "./credentialsRepository.js";
import { scheduleScrapper } from "./scheduleScrapper.js";
import { examScrapper } from "./examScrapper.js";
import type { Lesson, JobData } from "../types.js";
import {
  parseTimeToMinutes,
  groupConsecutiveLessonsByCourse,
} from "./lib/helpers.js";

export class NotificationService {
  private bot: Bot;
  private queue: Queue.Queue<JobData>;
  private chatRepository: ChatRepository;
  private credentialsRepo: CredentialsRepository;

  constructor(
    bot: Bot,
    chatRepository: ChatRepository,
    credentialsRepo: CredentialsRepository
  ) {
    this.bot = bot;
    this.chatRepository = chatRepository;
    this.credentialsRepo = credentialsRepo;

    const redisConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      ...(process.env.REDIS_PASSWORD && {
        password: process.env.REDIS_PASSWORD,
      }),
    };

    this.queue = new Queue<JobData>("notifications", {
      redis: redisConfig,
    });

    this.queue.process(async (job) => {
      try {
        await this.bot.api.sendMessage(job.data.chatId, job.data.message);
      } catch (error) {
        console.error(`Failed to send message to ${job.data.chatId}:`, error);
      }
    });
  }

  /**
   * Обновить расписание для всех настроенных чатов
   */
  async updateAllSchedules(): Promise<void> {
    console.log("🔄 Updating schedules for all configured chats...");

    const chats = await this.getAllChatsForNotifications();
    console.log(`📋 Found ${chats.length} chats to update`);

    for (const chatId of chats) {
      try {
        const credentials = await this.credentialsRepo.getCredentials(
          Number(chatId)
        );

        if (!credentials) {
          console.log(`⚠️ Chat ${chatId} has no credentials, skipping...`);
          continue;
        }

        console.log(`📥 Fetching schedule for chat ${chatId}...`);

        const result = await scheduleScrapper({
          username: credentials.username,
          password: credentials.password,
        });

        if (result.success && result.schedule) {
          await this.credentialsRepo.saveSchedule(
            Number(chatId),
            result.schedule
          );
          console.log(`✅ Schedule updated for chat ${chatId}`);
        } else {
          console.error(
            `❌ Failed to update schedule for chat ${chatId}: ${result.error}`
          );

          // Уведомляем в чате об ошибке
          await this.bot.api.sendMessage(
            chatId,
            "⚠️ Failed to update schedule. Please check your credentials using /settings"
          );
        }
      } catch (error) {
        console.error(`❌ Error updating schedule for chat ${chatId}:`, error);
      }
    }

    console.log("✅ Schedule update completed for all chats");
  }

  /**
   * Получить все чаты для отправки уведомлений
   * Объединяет чаты из bot:chats и чаты с настроенными credentials
   */
  private async getAllChatsForNotifications(): Promise<string[]> {
    const chatsFromSet = await this.chatRepository.getChats();
    const chatsFromCredentials =
      await this.credentialsRepo.getAllConfiguredChats();
    const allChatIds = new Set([...chatsFromSet, ...chatsFromCredentials]);
    return Array.from(allChatIds);
  }

  /**
   * Отправить утреннее сообщение с расписанием
   */
  async scheduleDailyMessage(): Promise<void> {
    console.log("📅 Starting daily schedule messages...");
    const chats = await this.getAllChatsForNotifications();
    console.log(`📋 Found ${chats.length} chats to process`);

    if (chats.length === 0) {
      console.log("⚠️ No chats found for daily messages");
      return;
    }

    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    console.log(`📆 Day key: ${dayKey}`);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const chatId of chats) {
      try {
        const schedule = await this.credentialsRepo.getSchedule(Number(chatId));

        if (!schedule) {
          console.log(`⚠️ Chat ${chatId}: No schedule found, skipping...`);
          skippedCount++;
          continue;
        }

        const lessons = schedule[dayKey] ?? [];

        if (lessons.length === 0) {
          console.log(`📭 Chat ${chatId}: No lessons for ${dayKey}, skipping`);
          continue;
        }

        console.log(
          `📚 Chat ${chatId}: Found ${lessons.length} lessons for ${dayKey}`
        );

        const grouped = groupConsecutiveLessonsByCourse(lessons);

        const lessonCount = lessons.length;
        const lessonWord = lessonCount === 1 ? "lesson" : "lessons";

        const today = new Date();
        const formattedDate = today.toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
        });
        const dayOfWeek = today.toLocaleDateString("en-US", {
          weekday: "long",
        });

        let msg = `📅 Good morning! Today is ${dayOfWeek}, ${formattedDate}, we have ${lessonCount} ${lessonWord}:\n\n`;

        for (const group of grouped) {
          const timeRange =
            group.startTime === group.endTime
              ? `🕐 ${group.startTime}`
              : `🕐 ${group.startTime}-${group.endTime}`;

          msg += `${timeRange} • ${group.course}\n`;
          msg += `📍 ${group.rooms.join(", ")}\n`;
          if (group.lessonType) {
            const typeLabel =
              group.lessonType === "lecture" ? "📘 Lecture" : "📙 Seminar";
            msg += `${typeLabel}\n`;
          }
          msg += `\n`;
        }

        msg += "Good luck everyone!";

        await this.queue.add({ chatId, message: msg });
        console.log(`✅ Chat ${chatId}: Daily message queued`);
        processedCount++;
      } catch (error) {
        console.error(
          `❌ Error sending daily message to ${chatId}:`,
          error instanceof Error ? error.message : error
        );
        errorCount++;
      }
    }

    console.log(
      `✅ Daily messages completed: ${processedCount} sent, ${skippedCount} skipped, ${errorCount} errors`
    );
  }

  private groupLessons(lessons: Lesson[]): Lesson[][] {
    if (lessons.length === 0) return [];

    const sorted = [...lessons].sort(
      (a, b) =>
        parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
    );

    const groups: Lesson[][] = [];
    if (sorted.length === 0) return groups;
    const firstLesson = sorted[0];
    if (!firstLesson) return groups;
    let currentGroup: Lesson[] = [firstLesson];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev || !curr) continue;
      const diff =
        parseTimeToMinutes(curr.start_time) -
        parseTimeToMinutes(prev.start_time);

      if (diff <= 60) {
        currentGroup.push(curr);
      } else {
        groups.push(currentGroup);
        currentGroup = [curr];
      }
    }

    groups.push(currentGroup);
    return groups;
  }

  /**
   * Запланировать уведомления о занятиях
   */
  async scheduleLessonsMessages(): Promise<void> {
    console.log("⏰ Starting lesson notifications scheduling...");
    const chats = await this.getAllChatsForNotifications();
    console.log(`📋 Found ${chats.length} chats to process`);

    if (chats.length === 0) {
      console.log("⚠️ No chats found for lesson notifications");
      return;
    }

    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    console.log(`📆 Day key: ${dayKey}`);

    for (const chatId of chats) {
      try {
        const schedule = await this.credentialsRepo.getSchedule(Number(chatId));

        if (!schedule) {
          console.log(`⚠️ No schedule found for chat ${chatId}`);
          continue;
        }

        const lessons = schedule[dayKey] ?? [];

        console.log(
          `📅 Chat ${chatId} - Day: ${dayKey}, Lessons:`,
          lessons.map((l: Lesson) => l.start_time)
        );

        if (lessons.length === 0) continue;

        const groups = this.groupLessons(lessons);

        console.log(
          `📚 Chat ${chatId} - Lesson groups:`,
          groups.map((g) => g.map((l) => l.start_time))
        );

        const activeJobs = await this.queue.getJobs([
          "waiting",
          "delayed",
          "active",
        ]);
        const activeJobIds = new Set<string>(
          activeJobs.map((job) => String(job.id))
        );

        for (const group of groups) {
          for (let i = 0; i < group.length; i++) {
            const lesson = group[i];
            if (!lesson) continue;

            const [hours, minutes] = lesson.start_time.split(":").map(Number);
            if (
              hours === undefined ||
              minutes === undefined ||
              Number.isNaN(hours) ||
              Number.isNaN(minutes)
            )
              continue;

            const start = new Date();
            start.setHours(hours, minutes, 0, 0);

            let notifyAt: Date;
            let message: string;

            if (i === 0) {
              notifyAt = new Date(start.getTime() - 60 * 60 * 1000);
              message = `👀 The ${
                lesson.lessonType ? lesson.lessonType : "lesson"
              } of ${
                lesson.course
              } will start in an hour and will take place at ${lesson.room}`;
            } else {
              notifyAt = new Date(start.getTime() - 10 * 60 * 1000);
              message = `👀 The next ${
                lesson.lessonType ? lesson.lessonType : "lesson"
              } of ${
                lesson.course
              } will start in 10 mins and will take place at ${lesson.room}`;
            }

            if (notifyAt <= new Date()) {
              console.log(
                `❌ Chat ${chatId} - Skipping lesson ${lesson.start_time} - notification time has passed`
              );
              continue;
            }

            const jobId = `lesson-${chatId}-${lesson.start_time}`;

            if (activeJobIds.has(jobId)) {
              console.log(
                `⚠️ Job already exists for chat ${chatId} - lesson ${lesson.start_time}`
              );
              continue;
            }

            console.log(
              `✅ Creating job for chat ${chatId} - lesson ${lesson.start_time}`
            );

            await this.queue.add(
              { chatId, message },
              {
                delay: notifyAt.getTime() - Date.now(),
                jobId,
                removeOnComplete: true,
                removeOnFail: true,
              }
            );
          }
        }
      } catch (error) {
        console.error(`❌ Error scheduling lessons for chat ${chatId}:`, error);
      }
    }
  }
  async updateExamSchedules(): Promise<void> {
    console.log("🔄 Updating exam schedules for all configured chats...");

    const chats = await this.getAllChatsForNotifications();
    
    for (const chatId of chats) {
      try {
        const credentials = await this.credentialsRepo.getCredentials(
          Number(chatId)
        );

        if (!credentials) continue;

        const result = await examScrapper({
          username: credentials.username,
          password: credentials.password,
        });

        if (result.success && result.exams) {
            await this.credentialsRepo.saveExamSchedule(Number(chatId), result.exams);
            console.log(`✅ Exam schedule updated for chat ${chatId}`);
        } else {
             console.error(`❌ Failed to update exam schedule for chat ${chatId}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error updating exam schedule for chat ${chatId}:`, error);
      }
    }
    console.log("✅ Exam schedule update completed");
  }

  async scheduleExamNotifications(): Promise<void> {
    console.log("🎓 Checking for exam notifications...");
    const chats = await this.getAllChatsForNotifications();

    for (const chatId of chats) {
        try {
            const exams = await this.credentialsRepo.getExamSchedule(Number(chatId));
            if (!exams || exams.length === 0) continue;

            const now = new Date();
            // Need to parse exam dates carefully. Format: "DD.MM.YYYY"
            
            console.log(`🔍 Chat ${chatId} checking exams, found ${exams.length} exams`);

            for (const exam of exams) {
                const [day, month, year] = exam.date.split('.').map(Number);
                const [hours, minutes] = exam.time.split(':').map(Number);
                
                const examDate = new Date(year, month - 1, day, hours, minutes);
                console.log(`📝 Processing exam: ${exam.subject} on ${examDate.toLocaleString()}`);

                // 1. "Today we are having exam!" (7 AM check)
                const isToday = now.getDate() === day && now.getMonth() === month - 1 && now.getFullYear() === year;

                if (isToday) {
                    const msg = `Today we are having exam ${exam.subject} in ${exam.time}, which would take place at ${exam.room}`;
                    console.log(`📨 Sending today's exam message for ${exam.subject}`);
                    await this.bot.api.sendMessage(chatId, msg);
                } else {
                     console.log(`⏭ Not today for ${exam.subject} (Exam date: ${day}.${month}.${year}, Now: ${now.getDate()}.${now.getMonth()+1}.${now.getFullYear()})`);
                }


                const notificationTime = new Date(examDate.getTime() - 2 * 60 * 60 * 1000);
                
                if (notificationTime > now) {
                     const jobId = `exam-${chatId}-${exam.subject}-${exam.date}`;
                     const activeJobs = await this.queue.getJobs(['waiting', 'delayed', 'active']);
                     const exists = activeJobs.find(j => j.id === jobId);
                     
                     if (!exists) {
                         const msg = `The exam of ${exam.subject} will start in 2 hours and would take place at ${exam.room}. Good luck! <3`;
                         await this.queue.add({ chatId, message: msg }, {
                             delay: notificationTime.getTime() - now.getTime(),
                             jobId,
                             removeOnComplete: true
                         });
                         console.log(`✅ Scheduled exam notification for ${chatId} at ${notificationTime}`);
                     } else {
                         console.log(`⚠️ Notification already scheduled for ${exam.subject}`);
                     }
                } else {
                    console.log(`❌ Too late to schedule 2h notification for ${exam.subject} (Notify at: ${notificationTime.toLocaleString()})`);
                }
            }
        } catch (error) {
            console.error(`❌ Error scheduling exam notifications for ${chatId}:`, error);
        }
    }
  }
}

