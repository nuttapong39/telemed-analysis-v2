// =============================================================================
// Toasts component — render, auto-dismiss, ARIA, manual dismiss
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import { Toasts } from '@/components/ui/Toasts'
import {
  notifyError,
  notifyWarning,
  notifyInfo,
  notifySuccess,
  __resetNotificationsForTests,
} from '@/services/notify'

function renderToasts() {
  return render(
    <NotificationsProvider>
      <Toasts />
    </NotificationsProvider>,
  )
}

beforeEach(() => {
  __resetNotificationsForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toasts', () => {
  it('renders nothing when the notification list is empty', () => {
    const { container } = renderToasts()
    expect(container.firstChild).toBeNull()
  })

  it('renders a notification after notifyError fires', () => {
    renderToasts()

    act(() => {
      notifyError('Database is unreachable')
    })

    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Database is unreachable')
  })

  it('uses aria-live="assertive" for error and "polite" for non-error', () => {
    renderToasts()

    act(() => {
      notifyError('err')
      notifyInfo('info')
    })

    const toasts = screen.getAllByRole('status')
    const errToast = toasts.find((t) => t.textContent?.includes('err'))!
    const infoToast = toasts.find((t) => t.textContent?.includes('info'))!
    expect(errToast).toHaveAttribute('aria-live', 'assertive')
    expect(infoToast).toHaveAttribute('aria-live', 'polite')
  })

  it('auto-dismisses an error toast after 8s and a success toast after 3s', () => {
    renderToasts()

    act(() => {
      notifyError('error-msg')
      notifySuccess('success-msg')
    })

    expect(screen.getAllByRole('status')).toHaveLength(2)

    // Advance 3.5s → success should be gone, error should remain.
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    const remaining = screen.getAllByRole('status')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toHaveTextContent('error-msg')

    // Advance another 5s (total 8.5s) → error should be gone.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('manual dismiss via the close button removes the toast immediately', () => {
    renderToasts()

    act(() => {
      notifyWarning('stale cache')
    })

    const toast = screen.getByRole('status')
    const closeBtn = within(toast).getByLabelText('Dismiss notification')
    fireEvent.click(closeBtn)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('honors the 4s dedupe: second identical call does not add a toast', () => {
    renderToasts()

    act(() => {
      notifyError('same')
      notifyError('same') // suppressed by emitter dedupe
    })

    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('multiple distinct notifications render in the order emitted', () => {
    renderToasts()

    act(() => {
      notifyError('first')
      notifyWarning('second')
      notifyInfo('third')
    })

    const toasts = screen.getAllByRole('status')
    expect(toasts.map((t) => t.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('first'),
        expect.stringContaining('second'),
        expect.stringContaining('third'),
      ]),
    )
  })
})
