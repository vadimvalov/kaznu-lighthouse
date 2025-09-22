import Queue from "bull";
import { Bot } from "grammy";
import { ChatRepository } from "./chat-repository.js";
import {
  getLessonWord,
  groupLessons,
  sanitizeTime,
  loadSchedule,
} from "./lib/helpers.js";
import type { JobData, ScheduleType } from "./lib/types.js";
export class NotificationService {
  private bot: Bot;
  private queue: Queue.Queue<JobData>;
  private chatRepository: ChatRepository;

  constructor(bot: Bot, chatRepository: ChatRepository) {
    this.bot = bot;
    this.chatRepository = chatRepository;

    this.queue = new Queue<JobData>("notifications", {
      redis: { host: "127.0.0.1", port: 6379 },
    });

    this.queue.process(async (job) => {
      await this.bot.api.sendMessage(job.data.chatId, job.data.message);
    });
  }

  async scheduleDailyMessage() {
    const currentSchedule = await this.chatRepository.getCurrentSchedule();
    const schedule = loadSchedule(currentSchedule);

    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const lessons = schedule[dayKey] ?? [];

    const lessonCount = lessons.length;
    const lessonWord = getLessonWord(lessonCount);

    const msg = `🫶 Доброе утро! Сегодня ${new Date().getDate()} число, ${new Date().toLocaleDateString(
      "ru-RU",
      { month: "long" }
    )}, и у нас ${lessonCount} ${lessonWord}`;

    const chats = await this.chatRepository.getChats();
    for (const id of chats) {
      await this.queue.add({ chatId: id, message: msg });
    }
  }

  async scheduleLessonsMessages() {
    const currentSchedule = await this.chatRepository.getCurrentSchedule();
    const schedule = loadSchedule(currentSchedule);

    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const lessons = schedule[dayKey] ?? [];
    if (lessons.length === 0) return;

    const groups = groupLessons(lessons);
    const chats = await this.chatRepository.getChats();

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

        const sanitizedTime = sanitizeTime(lesson.start_time);
        const [hours, minutes] = sanitizedTime.split(":").map(Number);
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
          message = `👀 Урок ${lesson.course} начнется через час и пройдет в ${lesson.room}`;
        } else {
          notifyAt = new Date(start.getTime() - 10 * 60 * 1000);
          message = `👀 Следующий урок ${lesson.course} начнется через 10 минут и пройдет в ${lesson.room}`;
        }

        if (notifyAt <= new Date()) {
          continue;
        }

        for (const id of chats) {
          const jobId = `lesson-${lesson.start_time}-${id}`;

          if (activeJobIds.has(jobId)) {
            continue;
          }

          await this.queue.add(
            { chatId: id, message },
            {
              delay: notifyAt.getTime() - Date.now(),
              jobId,
              removeOnComplete: true,
              removeOnFail: true,
            }
          );
        }
      }
    }
  }

  async switchSchedule(scheduleType: ScheduleType): Promise<void> {
    await this.chatRepository.setCurrentSchedule(scheduleType);
  }

  async getCurrentSchedule(): Promise<ScheduleType> {
    return await this.chatRepository.getCurrentSchedule();
  }
}
