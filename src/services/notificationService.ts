import Queue from "bull";
import { Bot } from "grammy";
import fs from "fs";
import path from "path";
import { UserRepository } from "./user-repository.js";

interface Lesson {
  start_time: string;
  course: string;
  room: string;
}
type Schedule = Record<string, Lesson[]>;

interface JobData {
  userId: string;
  message: string;
}

export class NotificationService {
  private bot: Bot;
  private queue: Queue.Queue<JobData>;
  private userRepository: UserRepository;
  private schedule: Schedule;

  constructor(bot: Bot, userRepository: UserRepository) {
    this.bot = bot;
    this.userRepository = userRepository;

    this.queue = new Queue<JobData>("notifications", {
      redis: { host: "127.0.0.1", port: 6379 },
    });

    this.queue.process(async (job) => {
      await this.bot.api.sendMessage(job.data.userId, job.data.message);
    });

    const file = path.resolve(process.cwd(), "src/public/schedule.json");
    this.schedule = JSON.parse(fs.readFileSync(file, "utf-8")) as Schedule;
  }

  async scheduleDailyMessage() {
    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const lessons = this.schedule[dayKey] ?? [];

    const lessonCount = lessons.length;
    const lessonWord =
      lessonCount === 1
        ? "занятие"
        : lessonCount >= 2 && lessonCount <= 4
        ? "занятия"
        : "занятий";

    const msg = `Доброе утро. Сегодня ${new Date().getDate()} ${new Date().toLocaleDateString(
      "ru-RU",
      { month: "long" }
    )} и у нас ${lessonCount} ${lessonWord}`;

    const users = await this.userRepository.getUsers();
    for (const id of users) {
      await this.queue.add({ userId: id, message: msg });
    }
  }

  async scheduleLessonsMessages() {
    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const lessons = this.schedule[dayKey] ?? [];

    const users = await this.userRepository.getUsers();

    const activeJobs = await this.queue.getJobs([
      "waiting",
      "delayed",
      "active",
    ]);
    const activeJobIds = new Set(activeJobs.map((job) => job.id));

    for (const lesson of lessons) {
      const [hours, minutes] = lesson.start_time.split(":").map(Number);

      const start = new Date();
      start.setHours(hours!, minutes!, 0, 0);

      const notifyAt = new Date(start.getTime() - 60 * 60 * 1000);

      if (notifyAt <= new Date()) {
        continue;
      }

      const message = `Урок *${lesson.course}* начнется через час и пройдет в *${lesson.room}*`;

      for (const id of users) {
        const jobId = `lesson-${lesson.start_time}-${id}`;

        if (activeJobIds.has(jobId)) {
          continue;
        }

        await this.queue.add(
          { userId: id, message },
          {
            delay: notifyAt.getTime() - Date.now(),
            jobId: jobId,
            removeOnComplete: true,
            removeOnFail: true,
          }
        );
      }
    }
  }
}
