import { createEventConnection } from "../dataset/external/sources/event-connection.js";
import { buildConnectionUrl } from "../dataset/external/sources/push-wire.js";
import type { EventConnection, ConnectionStatus } from "../dataset/external/sources/event-connection.js";
import type { PushSourceConfig } from "../dataset/external/sources/push-source.js";

export interface EventStreamPool {
  acquire(
    url: string,
    config: PushSourceConfig | undefined,
    batchEvents: boolean,
    topics: readonly string[],
  ): PoolHandle;
}

export interface PoolHandle {
  readonly eventTarget: EventTarget;
  readonly status: () => ConnectionStatus;
  release(topics: readonly string[]): void;
  onStatusChange?: ((status: ConnectionStatus) => void) | undefined;
}

interface PoolEntry {
  conn: EventConnection;
  eventTarget: EventTarget;
  refCount: number;
  topicCounts: Map<string, number>;
  handles: Set<PoolHandle>;
}

export function createEventStreamPool(): EventStreamPool {
  const entries = new Map<string, PoolEntry>();

  return {
    acquire(url, config, batchEvents, topics): PoolHandle {
      const key = buildConnectionUrl(url, config);
      let entry = entries.get(key);

      if (!entry) {
        const eventTarget = new EventTarget();
        const newEntry: PoolEntry = {
          conn: undefined as unknown as EventConnection,
          eventTarget,
          refCount: 0,
          topicCounts: new Map(),
          handles: new Set(),
        };
        const conn = createEventConnection(url, {
          config: config ? { ...config, eventTarget } : { eventTarget },
          batchEvents,
          onStatusChange: (status) => {
            for (const h of newEntry.handles) {
              h.onStatusChange?.(status);
            }
          },
        });
        newEntry.conn = conn;
        entry = newEntry;
        entries.set(key, entry);
      }

      entry.refCount++;

      const newTopics: string[] = [];
      for (const t of topics) {
        const count = entry.topicCounts.get(t) ?? 0;
        entry.topicCounts.set(t, count + 1);
        if (count === 0) newTopics.push(t);
      }
      if (newTopics.length > 0) {
        entry.conn.listen(newTopics).catch((err) => {
          console.warn("EventStreamPool: listen failed:", err);
        });
      }

      const capturedEntry = entry;

      const handle: PoolHandle = {
        eventTarget: entry.eventTarget,
        status: () => capturedEntry.conn.status,
        release(relTopics: readonly string[]): void {
          capturedEntry.handles.delete(handle);
          const deadTopics: string[] = [];
          for (const t of relTopics) {
            const count = capturedEntry.topicCounts.get(t) ?? 0;
            if (count <= 1) {
              capturedEntry.topicCounts.delete(t);
              deadTopics.push(t);
            } else {
              capturedEntry.topicCounts.set(t, count - 1);
            }
          }
          if (deadTopics.length > 0) {
            capturedEntry.conn.unlisten(deadTopics).catch(() => {});
          }
          capturedEntry.refCount--;
          if (capturedEntry.refCount <= 0) {
            capturedEntry.conn.close();
            entries.delete(key);
          }
        },
      };

      entry.handles.add(handle);

      return handle;
    },
  };
}

export const defaultPool: EventStreamPool = createEventStreamPool();
