import fs from "fs";
import path from "path";
import type { Lesson, Schedule, ScheduleType } from "./types.js";

export function parseTimeToMinutes(time: string): number {
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

export function sanitizeTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (
    h === undefined ||
    m === undefined ||
    Number.isNaN(h) ||
    Number.isNaN(m)
  ) {
    throw new Error(`Invalid time format: ${time}`);
  }

  let totalMinutes = h * 60 + m;

  // Shift by -3 hours (from GMT+5 to CEST UTC+2)
  totalMinutes -= 180;

  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;

  return `${newHours.toString().padStart(2, "0")}:${newMinutes
    .toString()
    .padStart(2, "0")}`;
}

export function getLessonWord(lessonCount: number): string {
  return lessonCount === 1
    ? "занятие"
    : lessonCount >= 2 && lessonCount <= 4
    ? "занятия"
    : "занятий";
}

export function groupLessons(lessons: Lesson[]): Lesson[][] {
  if (lessons.length === 0) return [];

  const sorted = [...lessons].sort(
    (a, b) =>
      parseTimeToMinutes(sanitizeTime(a.start_time)) -
      parseTimeToMinutes(sanitizeTime(b.start_time))
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
      parseTimeToMinutes(sanitizeTime(curr.start_time)) -
      parseTimeToMinutes(sanitizeTime(prev.start_time));

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

export function loadSchedule(scheduleType: ScheduleType): Schedule {
  const file = path.resolve(process.cwd(), `src/public/${scheduleType}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Schedule;
}
