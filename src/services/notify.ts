// =============================================================================
// Notifications — module-level emitter for user-visible toasts.
//
// Services (bmsSession.ts, etc.) call notifyError() from their catch paths
// without needing a React hook. A React provider subscribes at mount and
// renders the toast UI. Because the emitter is a plain module singleton,
// unit tests are unaffected unless they explicitly subscribe.
// =============================================================================

export type NotificationLevel = 'error' | 'warning' | 'info' | 'success';

export interface Notification {
  id: string;
  level: NotificationLevel;
  message: string;
  createdAt: number;
}

type Listener = (notifications: Notification[]) => void;

const state: { items: Notification[]; listeners: Set<Listener> } = {
  items: [],
  listeners: new Set(),
};

/** Dedupe window: if the same (level, message) fires inside this many ms,
 *  the second call is suppressed. Prevents a tight retry loop (e.g. polling
 *  after a broken session) from drowning the UI. */
const DEDUPE_WINDOW_MS = 4_000;

function emit(): void {
  const snap = [...state.items];
  state.listeners.forEach((l) => l(snap));
}

export function notify(level: NotificationLevel, message: string): string {
  const now = Date.now();
  // Suppress duplicate (same level+message) within the dedupe window.
  const isDup = state.items.some(
    (n) =>
      n.level === level &&
      n.message === message &&
      now - n.createdAt < DEDUPE_WINDOW_MS,
  );
  if (isDup) {
    return '';
  }

  const id = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  state.items = [...state.items, { id, level, message, createdAt: now }];
  emit();
  return id;
}

export const notifyError = (message: string): string => notify('error', message);
export const notifyWarning = (message: string): string => notify('warning', message);
export const notifyInfo = (message: string): string => notify('info', message);
export const notifySuccess = (message: string): string => notify('success', message);

export function dismissNotification(id: string): void {
  state.items = state.items.filter((n) => n.id !== id);
  emit();
}

export function clearAllNotifications(): void {
  state.items = [];
  emit();
}

export function subscribeToNotifications(listener: Listener): () => void {
  state.listeners.add(listener);
  listener([...state.items]);
  return () => {
    state.listeners.delete(listener);
  };
}

/** Test helper — wipe all state and listeners between test cases. */
export function __resetNotificationsForTests(): void {
  state.items = [];
  state.listeners.clear();
}
