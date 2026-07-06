export interface SSEEvent {
  readonly type: string;
  readonly data: unknown;
  readonly id?: string;
}

export interface SSESubscribeOptions {
  readonly eventNames?: readonly string[];
}

export type SSEHandler = (event: SSEEvent) => void;

interface HandlerEntry {
  readonly handler: SSEHandler;
  readonly options: SSESubscribeOptions | undefined;
  readonly boundListeners: Map<string, (e: Event) => void>;
}

interface BatchItem {
  readonly event: SSEEvent;
  readonly sourceName: string | null;
}

interface PoolEntry {
  source: EventSource;
  handlers: Map<SSEHandler, HandlerEntry>;
  status: "connected" | "reconnecting" | "disconnected";
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_BACKOFF_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;

export class SSEManager {
  private readonly _pool = new Map<string, PoolEntry>();
  private readonly _batchQueue = new Map<string, BatchItem[]>();
  private _rafId: number | null = null;

  subscribe(
    url: string,
    handler: SSEHandler,
    options?: SSESubscribeOptions,
  ): void {
    let entry = this._pool.get(url);
    if (!entry) {
      entry = this._createEntry(url);
      this._pool.set(url, entry);
    }

    if (entry.handlers.has(handler)) return;

    const handlerEntry: HandlerEntry = {
      handler,
      options,
      boundListeners: new Map(),
    };
    entry.handlers.set(handler, handlerEntry);
    this._attachNamedListeners(url, entry, handlerEntry);
  }

  unsubscribe(url: string, handler: SSEHandler): void {
    const entry = this._pool.get(url);
    if (!entry) return;

    const handlerEntry = entry.handlers.get(handler);
    if (!handlerEntry) return;

    this._detachNamedListeners(entry, handlerEntry);
    entry.handlers.delete(handler);

    if (entry.handlers.size === 0) {
      this._closeEntry(url, entry);
    }
  }

  status(url: string): "connected" | "reconnecting" | "disconnected" {
    return this._pool.get(url)?.status ?? "disconnected";
  }

  disconnectAll(): void {
    for (const [url, entry] of this._pool) {
      this._closeEntry(url, entry);
    }
  }

  private _createEntry(url: string): PoolEntry {
    const source = new EventSource(url);
    const entry: PoolEntry = {
      source,
      handlers: new Map(),
      status: "connected",
      reconnectAttempt: 0,
      reconnectTimer: null,
    };

    this._installUnnamedListener(url, entry);
    this._installErrorHandler(url, entry);

    return entry;
  }

  private _installUnnamedListener(url: string, entry: PoolEntry): void {
    entry.source.onmessage = (e: MessageEvent) => {
      entry.reconnectAttempt = 0;
      entry.status = "connected";

      try {
        const data = JSON.parse(e.data as string) as unknown;
        const event: SSEEvent = {
          type:
            ((data as Record<string, unknown>).type as string | undefined) ??
            "message",
          data,
          ...(e.lastEventId ? { id: e.lastEventId } : undefined),
        };
        this._enqueue(url, { event, sourceName: null });
      } catch {
        // Non-JSON SSE data — skip
      }
    };
  }

  private _installErrorHandler(url: string, entry: PoolEntry): void {
    entry.source.onerror = () => {
      entry.status = "reconnecting";
      entry.source.close();
      this._scheduleReconnect(url, entry);
    };
  }

  private _attachNamedListeners(
    url: string,
    entry: PoolEntry,
    he: HandlerEntry,
  ): void {
    const names = he.options?.eventNames;
    if (!names || names.length === 0) return;

    for (const name of names) {
      const listener = (e: Event) => {
        const me = e as MessageEvent;
        entry.reconnectAttempt = 0;
        entry.status = "connected";

        try {
          const data = JSON.parse(me.data as string) as unknown;
          const event: SSEEvent = {
            type: name,
            data,
            ...(me.lastEventId ? { id: me.lastEventId } : undefined),
          };
          this._enqueue(url, { event, sourceName: name });
        } catch {
          // Non-JSON SSE data — skip
        }
      };
      he.boundListeners.set(name, listener);
      entry.source.addEventListener(name, listener);
    }
  }

  private _detachNamedListeners(entry: PoolEntry, he: HandlerEntry): void {
    for (const [name, listener] of he.boundListeners) {
      entry.source.removeEventListener(name, listener);
    }
    he.boundListeners.clear();
  }

  private _enqueue(url: string, item: BatchItem): void {
    let queue = this._batchQueue.get(url);
    if (!queue) {
      queue = [];
      this._batchQueue.set(url, queue);
    }
    queue.push(item);

    if (this._rafId === null) {
      this._rafId = requestAnimationFrame(() => { this._flushBatch(); });
    }
  }

  private _flushBatch(): void {
    this._rafId = null;
    for (const [url, items] of this._batchQueue) {
      const entry = this._pool.get(url);
      if (!entry) continue;

      for (const { event, sourceName } of items) {
        for (const he of entry.handlers.values()) {
          const names = he.options?.eventNames;
          if (sourceName === null) {
            if (!names || names.length === 0) {
              he.handler(event);
            }
          } else {
            if (names && names.includes(sourceName)) {
              he.handler(event);
            }
          }
        }
      }
    }
    this._batchQueue.clear();
  }

  private _scheduleReconnect(url: string, entry: PoolEntry): void {
    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, entry.reconnectAttempt),
      MAX_BACKOFF_MS,
    );
    entry.reconnectAttempt++;
    entry.reconnectTimer = setTimeout(() => {
      if (!this._pool.has(url)) return;

      const newSource = new EventSource(url);
      entry.source = newSource;

      this._installUnnamedListener(url, entry);
      this._installErrorHandler(url, entry);

      for (const he of entry.handlers.values()) {
        he.boundListeners.clear();
        this._attachNamedListeners(url, entry, he);
      }
    }, delay);
  }

  private _closeEntry(url: string, entry: PoolEntry): void {
    for (const he of entry.handlers.values()) {
      this._detachNamedListeners(entry, he);
    }
    entry.source.close();
    if (entry.reconnectTimer !== null) clearTimeout(entry.reconnectTimer);
    entry.status = "disconnected";
    this._pool.delete(url);
  }
}
