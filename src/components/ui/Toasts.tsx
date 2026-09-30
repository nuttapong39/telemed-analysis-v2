import { useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'
import type { Notification, NotificationLevel } from '@/services/notify'
import { cn } from '@/lib/utils'

/** Auto-dismiss delay per level, in ms. `error` sticks around longer so users
 *  can read and act on it; `success` is quick. */
const AUTO_DISMISS_MS: Record<NotificationLevel, number> = {
  error: 8000,
  warning: 6000,
  info: 5000,
  success: 3000,
}

const ICON_MAP: Record<NotificationLevel, React.ComponentType<{ className?: string }>> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

const TONE_CLASSES: Record<NotificationLevel, string> = {
  error: 'border-red-400 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/80 dark:text-red-100',
  warning:
    'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100',
  info: 'border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-100',
  success:
    'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-100',
}

function ToastCard({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: (id: string) => void
}) {
  const Icon = ICON_MAP[notification.level]

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[notification.level]
    const timer = setTimeout(() => onDismiss(notification.id), ms)
    return () => clearTimeout(timer)
  }, [notification.id, notification.level, onDismiss])

  return (
    <div
      role="status"
      aria-live={notification.level === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 shadow-md transition-all',
        'animate-in slide-in-from-right-full fade-in',
        TONE_CLASSES[notification.level],
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm leading-5 break-words">{notification.message}</div>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Toasts() {
  const { notifications, dismiss } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {notifications.map((n) => (
        <ToastCard key={n.id} notification={n} onDismiss={dismiss} />
      ))}
    </div>
  )
}
