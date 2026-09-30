import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  subscribeToNotifications,
  dismissNotification,
  notify,
  type Notification,
  type NotificationLevel,
} from '@/services/notify'

interface NotificationsContextValue {
  notifications: Notification[]
  notify: (level: NotificationLevel, message: string) => string
  dismiss: (id: string) => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

export function NotificationsProvider({ children }: ProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => subscribeToNotifications(setNotifications), [])

  const value: NotificationsContextValue = {
    notifications,
    notify,
    dismiss: dismissNotification,
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return ctx
}
