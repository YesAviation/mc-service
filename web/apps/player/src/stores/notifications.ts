import { create } from "zustand";

export type NotificationTone = "success" | "error";

export type AppNotification = {
  id: number;
  message: string;
  tone: NotificationTone;
};

type NotificationState = {
  activeNotification: AppNotification | null;
  showNotification: (notification: Omit<AppNotification, "id">) => void;
  clearNotification: () => void;
};

let nextNotificationId = 1;

export const useNotificationStore = create<NotificationState>((set) => ({
  activeNotification: null,
  showNotification: (notification) => {
    set({
      activeNotification: {
        ...notification,
        id: nextNotificationId,
      },
    });
    nextNotificationId += 1;
  },
  clearNotification: () => {
    set({ activeNotification: null });
  },
}));
