export type Lesson = {
  start_time: string;
  course: string;
  room: string;
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
