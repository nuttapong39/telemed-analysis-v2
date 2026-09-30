// =============================================================================
// notify — emitter unit tests
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  notify,
  notifyError,
  notifyWarning,
  notifyInfo,
  notifySuccess,
  dismissNotification,
  subscribeToNotifications,
  clearAllNotifications,
  __resetNotificationsForTests,
  type Notification,
} from '@/services/notify';

beforeEach(() => {
  __resetNotificationsForTests();
});

describe('notify emitter', () => {
  it('emits a notification and returns its id', () => {
    const id = notifyError('boom');
    expect(id).toMatch(/\d+:\w+/);
  });

  it('pushes the notification to subscribers with level + message', () => {
    const received: Notification[][] = [];
    const unsub = subscribeToNotifications((n) => received.push(n));

    notifyError('boom');

    // Listener fires once synchronously on subscribe with empty, then again on emit.
    expect(received.length).toBe(2);
    expect(received[1][0].level).toBe('error');
    expect(received[1][0].message).toBe('boom');

    unsub();
  });

  it('emits distinct ids for distinct calls', () => {
    const id1 = notifyError('a');
    const id2 = notifyError('b');
    expect(id1).not.toBe(id2);
  });

  it('dedupes identical (level, message) within the 4s window', () => {
    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    const id1 = notifyError('duplicate');
    const id2 = notifyError('duplicate'); // suppressed

    expect(id1).not.toBe('');
    expect(id2).toBe('');
    // received: initial empty + first emit. No second emit.
    expect(received.length).toBe(2);
  });

  it('does NOT dedupe when level differs', () => {
    notifyError('same');
    const id = notifyWarning('same');
    expect(id).not.toBe('');
  });

  it('each level helper emits with the correct level', () => {
    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    notifyError('e');
    notifyWarning('w');
    notifyInfo('i');
    notifySuccess('s');

    // skip the initial empty snapshot, inspect the last state
    const last = received[received.length - 1];
    const levels = last.map((n) => n.level);
    expect(levels).toEqual(['error', 'warning', 'info', 'success']);
  });

  it('dismissNotification removes only the target id', () => {
    const a = notifyError('a');
    notifyError('b');

    dismissNotification(a);

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    const last = received[received.length - 1];
    expect(last.map((n) => n.message)).toEqual(['b']);
  });

  it('clearAllNotifications empties the list', () => {
    notifyError('a');
    notifyError('b');

    clearAllNotifications();

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));
    expect(received[0]).toEqual([]);
  });

  it('unsubscribe stops the listener from receiving further emits', () => {
    const calls: number[] = [];
    const unsub = subscribeToNotifications((n) => calls.push(n.length));

    notifyError('a');
    unsub();
    notifyError('b');

    // initial (empty) + 1 emit, then unsub; the post-unsub emit is not received.
    expect(calls).toEqual([0, 1]);
  });
});

describe('notify — generic', () => {
  it('notify(level, msg) accepts an explicit level', () => {
    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    notify('info', 'hello');

    const last = received[received.length - 1];
    expect(last[0].level).toBe('info');
  });

  it('sets createdAt timestamp', () => {
    const before = Date.now();
    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    notifyError('timed');

    const last = received[received.length - 1];
    expect(last[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(last[0].createdAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('notify — integration with bmsSession failures', () => {
  it('does NOT notify when Session unauthorized (handled by SessionExpired UI)', async () => {
    const { executeSqlViaApi } = await import('@/services/bmsSession');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 501,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(
      executeSqlViaApi('SELECT 1', {
        apiUrl: 'https://api.example',
        bearerToken: 'b',
        databaseType: 'mysql',
        appIdentifier: 'X',
      }),
    ).rejects.toThrow('Session unauthorized');

    // Only the initial empty snapshot — no notification emitted for expiry.
    expect(received.length).toBe(1);
    expect(received[0]).toEqual([]);
  });

  it('DOES notify on generic SQL failure', async () => {
    const { executeSqlViaApi } = await import('@/services/bmsSession');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          MessageCode: 409,
          Message: 'Bad SQL',
          RequestTime: '',
          result: {},
        }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const received: Notification[][] = [];
    subscribeToNotifications((n) => received.push(n));

    await expect(
      executeSqlViaApi('SELCT 1', {
        apiUrl: 'https://api.example',
        bearerToken: 'b',
        databaseType: 'mysql',
        appIdentifier: 'X',
      }),
    ).rejects.toThrow(/Bad SQL/);

    const last = received[received.length - 1];
    expect(last.length).toBe(1);
    expect(last[0].level).toBe('error');
    expect(last[0].message).toContain('SQL query');
    expect(last[0].message).toContain('Bad SQL');
  });
});
