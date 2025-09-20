import Queue from "bull";
import { Bot } from "grammy";
import fs from "fs";
import path from "path";
import { ChatRepository } from "./chat-repository.js";

interface Lesson {
  start_time: string;
  course: string;
  room: string;
}
type Schedule = Record<string, Lesson[]>;

interface JobData {
  chatId: string;
  message: string;
}

export class NotificationService {
  private bot: Bot;
  private queue: Queue.Queue<JobData>;
  private chatRepository: ChatRepository;
  private schedule: Schedule;

  constructor(bot: Bot, chatRepository: ChatRepository) {
    this.bot = bot;
    this.chatRepository = chatRepository;

    this.queue = new Queue<JobData>("notifications", {
      redis: { host: "127.0.0.1", port: 6379 },
    });

    this.queue.process(async (job) => {
      await this.bot.api.sendMessage(job.data.chatId, job.data.message);
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

    const msg = `🫶 Доброе утро! Сегодня ${new Date().getDate()} число, ${new Date().toLocaleDateString(
      "ru-RU",
      { month: "long" }
    )}, и у нас ${lessonCount} ${lessonWord}`;

    const chats = await this.chatRepository.getChats();
    for (const id of chats) {
      await this.queue.add({ chatId: id, message: msg });
    }
  }

  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    if (
      h === undefined ||
      m === undefined ||
      Number.isNaN(h) ||
      Number.isNaN(m)
    ) {
      throw new Error(`Invalid time format: ${time}`);
    }
    return h * 60 + m;
  }

  private groupLessons(lessons: Lesson[]): Lesson[][] {
    if (lessons.length === 0) return [];

    const sorted = [...lessons].sort(
      (a, b) =>
        this.parseTimeToMinutes(a.start_time) -
        this.parseTimeToMinutes(b.start_time)
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
        this.parseTimeToMinutes(curr.start_time) -
        this.parseTimeToMinutes(prev.start_time);

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

  async scheduleLessonsMessages() {
    const dayKey = new Date()
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const lessons = this.schedule[dayKey] ?? [];
    console.log(
      `📅 Day: ${dayKey}, Lessons:`,
      lessons.map((l) => l.start_time)
    );
    if (lessons.length === 0) return;

    const groups = this.groupLessons(lessons);
    console.log(
      `📚 Lesson groups:`,
      groups.map((g) => g.map((l) => l.start_time))
    );
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

        console.log(
          `🕐 Processing lesson: ${lesson.start_time} - ${lesson.course}`
        );

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
          message = `👀 Урок ${lesson.course} начнется через час и пройдет в ${lesson.room}`;
        } else {
          notifyAt = new Date(start.getTime() - 10 * 60 * 1000);
          message = `👀 Следующий урок ${lesson.course} начнется через 10 минут и пройдет в ${lesson.room}`;
        }

        console.log(
          `⏰ Lesson ${
            lesson.start_time
          }: notify at ${notifyAt.toLocaleTimeString()}, current time: ${new Date().toLocaleTimeString()}`
        );

        if (notifyAt <= new Date()) {
          console.log(
            `❌ Skipping lesson ${lesson.start_time} - notification time has passed`
          );
          continue;
        }

        for (const id of chats) {
          const jobId = `lesson-${lesson.start_time}-${id}`;

          if (activeJobIds.has(jobId)) {
            console.log(
              `⚠️ Job already exists for lesson ${lesson.start_time} - chat ${id}`
            );
            continue;
          }

          console.log(
            `✅ Creating job for lesson ${lesson.start_time} - chat ${id}`
          );
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
}
