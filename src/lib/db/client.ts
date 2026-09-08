/**
 * Main-thread handle on the SQLite worker.
 *
 * Every method degrades to a no-op when the database is unavailable (private
 * window, a second tab holding the OPFS pool, an old browser). Progress
 * tracking is a feature of the lessons, never a precondition for reading them
 * — a learner with no storage must still get the full page.
 */

export type DbStatus = 'idle' | 'opening' | 'ready' | 'locked' | 'unsupported' | 'error';

interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void }

class Db {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private opening: Promise<DbStatus> | null = null;

  status: DbStatus = 'idle';
  error: string | null = null;

  private listeners = new Set<(s: DbStatus) => void>();

  onStatus(fn: (s: DbStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: DbStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  async open(): Promise<DbStatus> {
    if (this.status === 'ready') return this.status;
    if (this.opening) return this.opening;

    this.opening = (async () => {
      this.setStatus('opening');
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent) => {
          const { id, ok, result, error } = e.data ?? {};
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          ok ? p.resolve(result) : p.reject(new Error(error));
        };
        this.worker.onerror = () => {
          this.error = 'worker failed to start';
          this.setStatus('error');
        };

        await this.call('open');
        this.setStatus('ready');
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        this.error = msg;
        this.setStatus(
          msg.startsWith('LOCKED') ? 'locked'
            : msg.startsWith('UNSUPPORTED') ? 'unsupported'
            : 'error',
        );
      }
      return this.status;
    })();

    return this.opening;
  }

  private call(op: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.worker) return Promise.reject(new Error('no worker'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, op, ...payload });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`db op "${op}" timed out`));
      }, 15_000);
    });
  }

  get available(): boolean {
    return this.status === 'ready';
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.available) return [];
    try {
      return (await this.call('query', { sql, params })) as T[];
    } catch {
      return [];
    }
  }

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.available) return;
    try { await this.call('exec', { sql, params }); } catch { /* progress is best-effort */ }
  }

  async batch(batch: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (!this.available) return;
    try { await this.call('batch', { batch }); } catch { /* progress is best-effort */ }
  }

  /** Raw bytes of the database file, for the export button. */
  async exportBytes(): Promise<Uint8Array | null> {
    if (!this.available) return null;
    try { return (await this.call('export')) as Uint8Array; } catch { return null; }
  }
}

export const db = new Db();

/** Local calendar day, not UTC — a streak must break at the learner's midnight. */
export function localDay(ts: number = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
