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
  error: 'border-rose-100 text-rose-700 [&>svg]:text-rose-500',
  warning: 'border-amber-100 text-amber-800 [&>svg]:text-amber-500',
  info: 'border-sky-100 text-sky-800 [&>svg]:text-sky-500',
  success: 'border-emerald-100 text-emerald-800 [&>svg]:text-emerald-500',
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
        'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white/95 px-4 py-3 backdrop-blur transition-all',
        'shadow-[0_12px_32px_-12px_rgb(15_23_42/0.25)]',
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
