export type Lesson = {
  start_time: string;
  course: string;
  room: string;
  lessonType?: "lecture" | "seminar";
};

export type Exam = {
  subject: string;
  date: string;
  time: string;
  room: string;
  type: string;
};

export type Schedule = {
  [key: string]: Lesson[];
};

export type NotificationJob = {
  userId: number;
  message: string;
  scheduledTime: Date;
};

export type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  totalUsers: number;
};

export type JobData = {
  chatId: string;
  message: string;
  scheduledTime?: number;
};

export type GroupedLesson = {
  course: string;
  startTime: string;
  endTime: string;
  rooms: string[];
  lessonType?: "lecture" | "seminar";
};
