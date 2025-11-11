export type Lesson = {
  start_time: string;
  course: string;
  room: string;
  lessonType?: "lecture" | "seminar";
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
};

export type GroupedLesson = {
  course: string;
  startTime: string;
  endTime: string;
  rooms: string[];
  lessonType?: "lecture" | "seminar";
};
