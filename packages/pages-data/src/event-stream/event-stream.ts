import { createEventConnection } from "../dataset/external/sources/event-connection.js";
import { buildConnectionUrl } from "../dataset/external/sources/push-wire.js";
import { matchesTopic } from "../dataset/external/sources/topic-matching.js";
import type { ConnectionStatus } from "../dataset/external/sources/event-connection.js";
import type { PushSourceConfig } from "../dataset/external/sources/push-source.js";
import type { EventStreamPool, PoolHandle } from "./event-stream-pool.js";
import { defaultPool } from "./event-stream-pool.js";

export interface EventStreamOptions<T = unknown> {
  config?: PushSourceConfig;
  maxBuffer?: number;
  shared?: boolean;
  batchEvents?: boolean;
  parse?: (raw: unknown) => T;
  pool?: EventStreamPool;
  onChange?: () => void;
  onReconnect?: () => void;
}

export class EventStream<T = unknown> {
  private readonly url: string;
  private readonly topics: readonly string[];
  private readonly maxBuffer: number;
  private readonly shared: boolean;
  private readonly batchEvents: boolean;
  private readonly parse: ((raw: unknown) => T) | undefined;
  private readonly pool: EventStreamPool;
  private readonly config: PushSourceConfig | undefined;
  private readonly onChange: (() => void) | undefined;
  private readonly onReconnect: (() => void) | undefined;

  private handle: PoolHandle | undefined;
  private listener: ((e: Event) => void) | undefined;
  private _latest: T | undefined;
  private _all: readonly T[] = [];
  private _prevStatus: ConnectionStatus = "disconnected";

  constructor(
    url: string,
    topics: string | string[],
    options?: EventStreamOptions<T>,
  ) {
    this.url = url;
    this.topics = Array.isArray(topics) ? topics : [topics];
    this.maxBuffer = options?.maxBuffer ?? 100;
    this.shared = options?.shared ?? true;
    this.batchEvents = options?.batchEvents ?? false;
    this.parse = options?.parse;
    this.pool = options?.pool ?? defaultPool;
    this.config = options?.config;
    this.onChange = options?.onChange;
    this.onReconnect = options?.onReconnect;
  }

  get latest(): T | undefined {
    return this._latest;
  }

  get all(): readonly T[] {
    return this._all;
  }

  get status(): ConnectionStatus {
    return this.handle?.status() ?? "disconnected";
  }

  connect(): void {
    if (this.handle) return;

    if (this.shared) {
      this.handle = this.pool.acquire(
        this.url,
        this.config,
        this.batchEvents,
        this.topics,
      );
    } else {
      const eventTarget = new EventTarget();
      const conn = createEventConnection(this.url, {
        config: this.config
          ? { ...this.config, eventTarget }
          : { eventTarget },
        batchEvents: this.batchEvents,
        onStatusChange: (status) => {
          this.handleStatusChange(status);
        },
      });
      conn.listen([...this.topics]).catch((err) => {
        console.warn("EventStream: listen failed:", err);
      });
      this.handle = {
        eventTarget,
        status: () => conn.status,
        release: (topics) => {
          conn.unlisten([...topics]).catch(() => {});
          conn.close();
        },
      };
    }

    if (this.shared && this.handle) {
      this.handle.onStatusChange = (status) => {
        this.handleStatusChange(status);
      };
    }

    this._prevStatus = this.handle?.status() ?? "disconnected";

    this.listener = (e: Event) => {
      const detail = (e as CustomEvent<{ topic: string; payload: unknown }>).detail;
      if (!detail?.topic) return;

      const matches = this.topics.some((pattern) =>
        matchesTopic(pattern, detail.topic),
      );
      if (!matches) return;

      let value: T;
      if (this.parse) {
        try {
          value = this.parse(detail.payload);
        } catch (err) {
          console.warn("EventStream: parse failed, dropping event:", err);
          return;
        }
      } else {
        value = detail.payload as T;
      }

      this._latest = value;
      const updated = [...this._all, value];
      this._all =
        updated.length > this.maxBuffer
          ? updated.slice(updated.length - this.maxBuffer)
          : updated;
      this.onChange?.();
    };

    this.handle.eventTarget.addEventListener("pages-event", this.listener);
  }

  disconnect(): void {
    if (!this.handle) return;

    if (this.listener) {
      this.handle.eventTarget.removeEventListener("pages-event", this.listener);
      this.listener = undefined;
    }

    if (this.handle.onStatusChange) {
      this.handle.onStatusChange = undefined;
    }

    this.handle.release(this.topics);
    this.handle = undefined;
    this._prevStatus = "disconnected";
  }

  private handleStatusChange(status: ConnectionStatus): void {
    if (this._prevStatus === "reconnecting" && status === "connected") {
      this.onReconnect?.();
    }
    this._prevStatus = status;
  }
}
