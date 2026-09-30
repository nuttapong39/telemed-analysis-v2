// =============================================================================
// API Queue Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiRequestQueue } from '@/services/apiQueue';

/** Queue options that eliminate retry delays for fast tests */
const ZERO_DELAY = { baseRetryDelayMs: 0, maxRetryDelayMs: 0 };

describe('ApiRequestQueue', () => {
  let queue: ApiRequestQueue;

  beforeEach(() => {
    queue = new ApiRequestQueue();
  });

  afterEach(() => {
    queue.clear();
  });

  describe('enqueue', () => {
    it('MUST execute a request and return the result', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'test' });

      const result = await queue.enqueue('test-1', executor);

      expect(result).toEqual({ data: 'test' });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('MUST deduplicate identical requests', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'shared' });

      const promise1 = queue.enqueue('dup-1', executor);
      const promise2 = queue.enqueue('dup-1', executor);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ data: 'shared' });
      expect(result2).toEqual({ data: 'shared' });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('MUST not deduplicate different requests', async () => {
      const executor1 = vi.fn().mockResolvedValue({ data: 'first' });
      const executor2 = vi.fn().mockResolvedValue({ data: 'second' });

      const promise1 = queue.enqueue('diff-1', executor1);
      const promise2 = queue.enqueue('diff-2', executor2);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ data: 'first' });
      expect(result2).toEqual({ data: 'second' });
      expect(executor1).toHaveBeenCalledTimes(1);
      expect(executor2).toHaveBeenCalledTimes(1);
    });

    it('MUST reject on non-rate-limit errors', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(queue.enqueue('error-1', executor)).rejects.toThrow('Network error');
      expect(executor).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry on rate limit', () => {
    it('MUST retry on HTTP 429 errors and succeed', async () => {
      const retryQueue = new ApiRequestQueue(ZERO_DELAY);

      const executor = vi.fn()
        .mockRejectedValueOnce(new Error('มีการร้องขอบ่อยเกินไป (HTTP 429). กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'))
        .mockResolvedValueOnce({ data: 'success after retry' });

      const result = await retryQueue.enqueue('retry-1', executor);

      expect(result).toEqual({ data: 'success after retry' });
      expect(executor).toHaveBeenCalledTimes(2);

      retryQueue.clear();
    });

    it('MUST reject after max retry attempts exceeded', async () => {
      const retryQueue = new ApiRequestQueue(ZERO_DELAY);

      const rateLimitError = new Error('มีการร้องขอบ่อยเกินไป (HTTP 429). กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
      const executor = vi.fn().mockRejectedValue(rateLimitError);

      await expect(retryQueue.enqueue('retry-exhaust-1', executor)).rejects.toThrow('429');
      // 1 initial + 3 retries = 4 calls
      expect(executor).toHaveBeenCalledTimes(4);

      retryQueue.clear();
    });
  });

  describe('getStats', () => {
    it('MUST track completed requests', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'test' });

      await queue.enqueue('stats-1', executor);

      const stats = queue.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.active).toBe(0);
    });

    it('MUST track failed requests', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await queue.enqueue('fail-1', executor);
      } catch {
        // Expected
      }

      const stats = queue.getStats();
      expect(stats.failed).toBe(1);
      expect(stats.completed).toBe(0);
    });

    it('MUST reset counters on clear', async () => {
      const executor = vi.fn().mockResolvedValue({ data: 'test' });
      await queue.enqueue('clear-stats-1', executor);

      queue.clear();

      const stats = queue.getStats();
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('clear', () => {
    it('MUST reject pending requests on clear', async () => {
      // Fill concurrency slots with blocking requests
      const blockingPromises: Promise<unknown>[] = [];
      for (let i = 0; i < 3; i++) {
        blockingPromises.push(
          queue.enqueue(`blocking-${i}`, () => new Promise(() => {})) // never resolves
        );
      }

      // This one is queued but not yet executing
      const queued = queue.enqueue('queued-1', () => Promise.resolve('should not resolve'));

      queue.clear();

      await expect(queued).rejects.toThrow('Request cancelled');

      // Suppress unhandled rejections from blocking promises
      blockingPromises.forEach((p) => p.catch(() => {}));
    });
  });

  describe('concurrency', () => {
    it('MUST limit concurrent execution to 3', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const makeExecutor = () => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        // Use a real microtask delay instead of setTimeout
        await new Promise(resolve => resolve(undefined));
        await new Promise(resolve => resolve(undefined));
        currentConcurrent--;
        return { ok: true };
      };

      const promises = Array(6).fill(null).map((_, i) =>
        queue.enqueue(`conc-${i}`, makeExecutor())
      );

      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('MUST handle multiple concurrent requests returning correct results', async () => {
      const executors = Array(5).fill(null).map((_, i) =>
        vi.fn().mockResolvedValue({ id: i })
      );

      const promises = executors.map((exec, i) =>
        queue.enqueue(`concurrent-${i}`, exec)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((r, i) => {
        expect(r).toEqual({ id: i });
      });
    });
  });

  // -------------------------------------------------------------------------
  // setMaxConcurrent — runtime ceiling mutation
  // -------------------------------------------------------------------------

  describe('setMaxConcurrent', () => {
    /** A manually-controlled deferred — the test decides when the task finishes
     *  rather than racing against setTimeout wall-clock delays. */
    function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    it('raising the ceiling drains queued requests that were blocked', async () => {
      const q = new ApiRequestQueue({ maxConcurrent: 1 });
      const d1 = defer<string>();
      const d2 = defer<string>();
      const d3 = defer<string>();

      const p1 = q.enqueue('a', () => d1.promise);
      const p2 = q.enqueue('b', () => d2.promise);
      const p3 = q.enqueue('c', () => d3.promise);

      // processQueue ran synchronously inside enqueue; first task is active,
      // remaining two are pending. No timers involved, no timing race.
      expect(q.getStats().active).toBe(1);
      expect(q.getStats().pending).toBe(2);

      // Raising the ceiling synchronously drains the backlog (setMaxConcurrent
      // runs processQueue in a while-loop until full or empty).
      q.setMaxConcurrent(3);
      expect(q.getStats().active).toBe(3);
      expect(q.getStats().pending).toBe(0);

      // Clean up: resolve all tasks so the queue's internal promises settle.
      d1.resolve('a');
      d2.resolve('b');
      d3.resolve('c');
      await Promise.all([p1, p2, p3]);
    });

    it('lowering the ceiling does NOT cancel in-flight requests', async () => {
      const q = new ApiRequestQueue({ maxConcurrent: 5 });
      const d1 = defer<string>();
      const d2 = defer<string>();

      const inFlight = [
        q.enqueue('x', () => d1.promise),
        q.enqueue('y', () => d2.promise),
      ];

      // Both tasks are running; drop the ceiling mid-flight.
      q.setMaxConcurrent(1);
      expect(q.getStats().active).toBe(2); // still running

      d1.resolve('x');
      d2.resolve('y');
      const results = await Promise.all(inFlight);
      expect(results).toEqual(['x', 'y']);
    });

    it('ignores invalid values (NaN, 0, negative) as no-op', async () => {
      const q = new ApiRequestQueue({ maxConcurrent: 2 });
      const before = q.getStats();

      q.setMaxConcurrent(0);
      q.setMaxConcurrent(-1);
      q.setMaxConcurrent(NaN);

      // New request should still work (ceiling still 2).
      const result = await q.enqueue('k', async () => 'ok');
      expect(result).toBe('ok');
      expect(q.getStats().completed).toBe(before.completed + 1);
    });

    it('floors non-integer values (e.g. 3.7 → 3)', async () => {
      const q = new ApiRequestQueue({ maxConcurrent: 1 });
      const deferreds = [defer<string>(), defer<string>(), defer<string>(), defer<string>()];

      const promises = deferreds.map((d, i) =>
        q.enqueue(`d${i}`, () => d.promise),
      );

      // Before raise: 1 active, 3 queued.
      expect(q.getStats().active).toBe(1);

      q.setMaxConcurrent(3.7); // should floor to 3

      // After raise: 3 active, 1 still queued (limit is 3, not 4).
      expect(q.getStats().active).toBe(3);
      expect(q.getStats().pending).toBe(1);

      deferreds.forEach((d, i) => d.resolve(`d${i}`));
      await Promise.all(promises);
    });
  });
});
