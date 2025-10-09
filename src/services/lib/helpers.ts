import type { Lesson, GroupedLesson } from "../../types.js";

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

export function getEndTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return time;
  }
  const totalMinutes = hours * 60 + minutes + 50;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, "0")}:${newMinutes
    .toString()
    .padStart(2, "0")}`;
}

export function groupConsecutiveLessonsByCourse(
  lessons: Lesson[]
): GroupedLesson[] {
  if (lessons.length === 0) {
    return [];
  }

  // Сортируем уроки по времени
  const sortedLessons = [...lessons].sort(
    (a, b) =>
      parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time)
  );

  const grouped: GroupedLesson[] = [];
  let i = 0;

  while (i < sortedLessons.length) {
    const current = sortedLessons[i];
    if (!current) {
      i++;
      continue;
    }

    let startTime = current.start_time;
    let endTime = getEndTime(current.start_time);
    const rooms = new Set<string>([current.room]);
    const courseName = current.course;

    // Находим все последовательные уроки с таким же названием
    let j = i + 1;
    while (j < sortedLessons.length) {
      const next = sortedLessons[j];
      if (!next) break;

      // Проверяем, что это тот же курс и уроки идут последовательно (через час)
      const timeDiff =
        parseTimeToMinutes(next.start_time) -
        parseTimeToMinutes(sortedLessons[j - 1]!.start_time);

      if (next.course === courseName && timeDiff === 60) {
        endTime = getEndTime(next.start_time);
        rooms.add(next.room);
        j++;
      } else {
        break;
      }
    }

    grouped.push({
      course: courseName,
      startTime,
      endTime,
      rooms: Array.from(rooms),
    });

    i = j;
  }

  return grouped;
}
