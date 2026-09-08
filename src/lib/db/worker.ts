/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import schema from './schema.sql?raw';

/**
 * Owns the SQLite database. Runs in a worker because the OPFS SyncAccessHandle
 * Pool VFS needs synchronous file handles, which are only available off the
 * main thread.
 *
 * The VFS choice matters: sqlite-wasm's default `opfs` VFS requires
 * SharedArrayBuffer, which requires COOP/COEP response headers, which GitHub
 * Pages cannot set. `opfs-sahpool` avoids SharedArrayBuffer entirely. Its one
 * cost is that only a single tab may hold the database at a time, which we
 * detect and report rather than crash on.
 */

let db: Database | null = null;
let sqlite3: Sqlite3Static | null = null;

type Req = { id: number; op: string; sql?: string; params?: unknown[]; batch?: { sql: string; params?: unknown[] }[] };

async function open(): Promise<void> {
  // The published types declare no parameters, but the module does accept a
  // config object; without it every SQLite notice lands in the console.
  sqlite3 = await (sqlite3InitModule as (cfg?: unknown) => Promise<Sqlite3Static>)({
    print: () => {},
    printErr: () => {},
  });

  if (!('installOpfsSAHPoolVfs' in sqlite3)) {
    throw new Error('UNSUPPORTED: this browser has no OPFS SyncAccessHandle support');
  }

  let poolUtil;
  try {
    poolUtil = await (sqlite3 as any).installOpfsSAHPoolVfs({ name: 'anthropocene', initialCapacity: 8 });
  } catch (err) {
    // The pool is already held — almost always this app open in another tab.
    throw new Error(`LOCKED: ${(err as Error)?.message ?? 'database is open in another tab'}`);
  }

  db = new poolUtil.OpfsSAHPoolDb('/anthropocene.sqlite3');
  db!.exec(schema);
}

function rows(sql: string, params: unknown[] = []): unknown[] {
  if (!db) throw new Error('database not open');
  const out: unknown[] = [];
  db.exec({ sql, bind: params as any, rowMode: 'object', callback: (r: unknown) => { out.push(r); } });
  return out;
}

function run(sql: string, params: unknown[] = []): void {
  if (!db) throw new Error('database not open');
  db.exec({ sql, bind: params as any });
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, op } = e.data;
  const reply = (payload: Record<string, unknown>) => self.postMessage({ id, ...payload });

  try {
    switch (op) {
      case 'open':
        await open();
        return reply({ ok: true, result: true });

      case 'query':
        return reply({ ok: true, result: rows(e.data.sql!, e.data.params) });

      case 'exec':
        run(e.data.sql!, e.data.params);
        return reply({ ok: true, result: true });

      case 'batch': {
        // One transaction: a lesson completion writes an attempt, an xp_event
        // and a progress row, and those must not be able to half-apply.
        run('BEGIN');
        try {
          for (const stmt of e.data.batch ?? []) run(stmt.sql, stmt.params);
          run('COMMIT');
        } catch (err) {
          run('ROLLBACK');
          throw err;
        }
        return reply({ ok: true, result: true });
      }

      case 'export': {
        if (!db || !sqlite3) throw new Error('database not open');
        const bytes = (sqlite3 as any).capi.sqlite3_js_db_export(db);
        return reply({ ok: true, result: bytes }, );
      }

      default:
        return reply({ ok: false, error: `unknown op "${op}"` });
    }
  } catch (err) {
    reply({ ok: false, error: (err as Error)?.message ?? String(err) });
  }
};
