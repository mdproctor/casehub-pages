let _reqCounter = 0;

export function nextRequestId(): string {
  return String(++_reqCounter);
}

export function buildConnectionUrl(
  baseUrl: string,
  config?: {
    relay?: { endpoint: string };
    auth?: { type: "query-param"; paramName?: string; token: string };
  },
): string {
  let url = new URL(baseUrl);
  if (config?.relay) {
    url = new URL(config.relay.endpoint);
    url.searchParams.set("target", baseUrl);
  }
  if (config?.auth?.type === "query-param") {
    url.searchParams.set(config.auth.paramName ?? "token", config.auth.token);
  }
  return url.toString();
}

export function sendListen(
  ws: WebSocket,
  id: string,
  topics: string[],
  since?: Record<string, number>,
): void {
  const payload: { op: string; id: string; topics: string[]; since?: Record<string, number> } = {
    op: "listen",
    id,
    topics,
  };
  if (since !== undefined) {
    payload.since = since;
  }
  ws.send(JSON.stringify(payload));
}

export function sendUnlisten(ws: WebSocket, id: string, topics: string[]): void {
  ws.send(JSON.stringify({ op: "unlisten", id, topics }));
}

export function sendSubscribe(
  ws: WebSocket,
  id: string,
  dataset: string,
  since?: string,
): void {
  const payload: { op: string; id: string; dataset: string; since?: string } = {
    op: "subscribe",
    id,
    dataset,
  };
  if (since !== undefined) {
    payload.since = since;
  }
  ws.send(JSON.stringify(payload));
}

export function sendUnsubscribe(ws: WebSocket, id: string, dataset: string): void {
  ws.send(JSON.stringify({ op: "unsubscribe", id, dataset }));
}

export function dispatchWireEvent(
  msg: { topic?: string; payload?: unknown },
  eventTarget: EventTarget,
): void {
  if (msg.topic) {
    eventTarget.dispatchEvent(new CustomEvent("pages-event", {
      bubbles: true,
      composed: true,
      detail: { topic: msg.topic, payload: msg.payload },
    }));
  }
}
