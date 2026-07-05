import type { PushSourceConfig } from "./push-source.js";
import { buildConnectionUrl, nextRequestId, sendListen, sendUnlisten, dispatchWireEvent } from "./push-wire.js";

export interface ListenAck {
  readonly topics: string[];
  readonly gaps?: string[];
}

export interface EventConnection {
  send(message: object): void;
  listen(topics: string[]): Promise<ListenAck>;
  unlisten(topics: string[]): Promise<void>;
  close(): void;
  readonly connected: boolean;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Check if a concrete topic is matched by any registration (exact or wildcard prefix).
 */
export function isMatchedByRegistrations(topic: string, registrations: Set<string>): boolean {
  for (const reg of registrations) {
    if (reg === topic) return true;
    if (reg.endsWith("*") && topic.startsWith(reg.slice(0, -1))) return true;
  }
  return false;
}

export function createEventConnection(
  url: string,
  config?: PushSourceConfig,
): EventConnection {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const listenRegistrations = new Set<string>();
  const pending = new Map<string, PendingEntry>();
  const topicSeqs = new Map<string, number>();

  const connectionUrl = buildConnectionUrl(url, config);

  function rejectAllPending(reason: string): void {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    pending.clear();
  }

  function connect(): void {
    if (closed) return;
    ws = new WebSocket(connectionUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      if (listenRegistrations.size > 0 && ws) {
        // Two-phase reconnect since construction
        const since: Record<string, number> = {};

        // Phase 1: seed exact topics from registrations
        for (const reg of listenRegistrations) {
          if (!reg.endsWith("*")) {
            since[reg] = topicSeqs.get(reg) ?? 0;
          }
        }

        // Phase 2: add/override with concrete topic positions from topicSeqs
        for (const [topic, seq] of topicSeqs) {
          if (isMatchedByRegistrations(topic, listenRegistrations)) {
            since[topic] = seq;
          }
        }

        const id = nextRequestId();
        sendListen(
          ws,
          id,
          [...listenRegistrations],
          Object.keys(since).length > 0 ? since : undefined,
        );
        // Reconnect listen is fire-and-forget — no Promise to resolve
      }
    };

    ws.onmessage = (e: MessageEvent) => {
      handleMessage(e.data as string);
    };

    ws.onclose = (e: CloseEvent) => {
      rejectAllPending("connection closed");
      if (closed) return;
      if (e.code >= 4000) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      reconnectAttempt++;
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {};
  }

  function handleMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn("[EventConnection] Failed to parse message:", data);
      return;
    }
    const messages = Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
    for (const msg of messages) {
      if (typeof msg !== "object" || msg === null) continue;
      const record = msg as Record<string, unknown>;
      const op = record.op as string | undefined;

      if (op === "ack") {
        const id = record.id as string | undefined;
        if (id && pending.has(id)) {
          const entry = pending.get(id)!;
          clearTimeout(entry.timer);
          pending.delete(id);
          const ack: ListenAck = {
            topics: Array.isArray(record.topics)
              ? (record.topics as string[])
              : [],
            ...(Array.isArray(record.gaps) ? { gaps: record.gaps as string[] } : {}),
          };
          entry.resolve(ack);
        }
        continue;
      }

      if (op === "error") {
        const id = record.id as string | undefined;
        if (id && pending.has(id)) {
          const entry = pending.get(id)!;
          clearTimeout(entry.timer);
          pending.delete(id);
          entry.reject(new Error((record.message as string) ?? "unknown error"));
        }
        continue;
      }

      if (op === "event" && config?.eventTarget) {
        const topic = record.topic as string | undefined;
        const seq = record.seq;

        // Seq tracking + dedup
        if (topic && typeof seq === "number") {
          const tracked = topicSeqs.get(topic);
          if (tracked !== undefined && seq <= tracked) {
            // Duplicate — silently skip
            continue;
          }
          topicSeqs.set(topic, seq);
        }

        dispatchWireEvent(
          msg as { topic?: string; payload?: unknown },
          config.eventTarget,
        );
      }
    }
  }

  connect();

  return {
    get connected() { return !closed && ws?.readyState === 1; },

    send(message: object): void {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(message));
      }
    },

    listen(topics: string[]): Promise<ListenAck> {
      for (const t of topics) {
        listenRegistrations.add(t);
      }

      if (!ws || ws.readyState !== 1) {
        // Not connected — registration stored, will be sent on connect
        // Return a resolved promise since we can't track ack until connected
        return Promise.resolve({ topics });
      }

      const id = nextRequestId();
      sendListen(ws, id, topics);

      return new Promise<ListenAck>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("request timeout"));
        }, DEFAULT_TIMEOUT_MS);

        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
        });
      });
    },

    unlisten(topics: string[]): Promise<void> {
      for (const t of topics) {
        listenRegistrations.delete(t);
      }

      // Clean topicSeqs entries for topics no longer matched by any registration
      for (const topic of [...topicSeqs.keys()]) {
        if (!isMatchedByRegistrations(topic, listenRegistrations)) {
          topicSeqs.delete(topic);
        }
      }

      if (!ws || ws.readyState !== 1) {
        return Promise.resolve();
      }

      const id = nextRequestId();
      sendUnlisten(ws, id, topics);

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("request timeout"));
        }, DEFAULT_TIMEOUT_MS);

        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timer,
        });
      });
    },

    close(): void {
      closed = true;
      rejectAllPending("connection closed");
      listenRegistrations.clear();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close(1000, "client closed");
      ws = null;
    },
  };
}
