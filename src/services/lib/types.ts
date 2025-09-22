export type Lesson = {
  start_time: string;
  course: string;
  room: string;
};

export type Schedule = Record<string, Lesson[]>;

export type JobData = {
  chatId: string;
  message: string;
};

export type ScheduleType = "schedule_1" | "schedule_2";
