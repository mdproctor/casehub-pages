import type { LitElement, PropertyValues } from "lit";
import { property } from "lit/decorators.js";
import { EventStream } from "@casehubio/pages-data";
import type { EventStreamOptions, ConnectionStatus } from "@casehubio/pages-data";

type Constructor<T = Record<string, unknown>> = new (...args: any[]) => T;

export function PushMixin<T extends Constructor<LitElement>>(Base: T) {
  class PushHost extends Base {
    @property({ attribute: "push-url" }) pushUrl = "";
    @property({ attribute: false }) pushTopics: string[] = [];

    private _pushStream: EventStream | null = null;
    private _lastPushEvent: unknown = undefined;
    private _pushEventCount = 0;

    get pushStatus(): ConnectionStatus {
      return this._pushStream?.status ?? "disconnected";
    }

    get pushConnected(): boolean {
      return this._pushStream?.status === "connected";
    }

    get pushLatest(): unknown {
      return this._pushStream?.latest;
    }

    protected createPushOptions(): Partial<EventStreamOptions> {
      return {};
    }

    protected onPushEvent(_event: unknown): void {
      // Override in consumer for domain-specific logic.
      // Default: requestUpdate (reactive pull via pushLatest).
    }

    override connectedCallback(): void {
      super.connectedCallback();
      this._setupPush();
    }

    override disconnectedCallback(): void {
      super.disconnectedCallback();
      this._teardownPush();
    }

    override willUpdate(changed: PropertyValues): void {
      super.willUpdate(changed);
      if (changed.has("pushUrl") || changed.has("pushTopics")) {
        this._teardownPush();
        this._setupPush();
      }
    }

    private _setupPush(): void {
      if (!this.pushUrl || !this.pushTopics.length) return;
      const opts = this.createPushOptions();
      this._pushStream = new EventStream(this.pushUrl, this.pushTopics, {
        ...opts,
        batchEvents: opts.batchEvents ?? true,
        onChange: () => {
          const latest = this._pushStream?.latest;
          if (latest !== undefined && latest !== this._lastPushEvent) {
            this._lastPushEvent = latest;
            this._pushEventCount++;
            this.onPushEvent(latest);
            (this as unknown as LitElement).requestUpdate();
          }
        },
      });
      this._pushStream.connect();
    }

    private _teardownPush(): void {
      this._pushStream?.disconnect();
      this._pushStream = null;
    }
  }

  return PushHost as unknown as Constructor<{
    pushUrl: string;
    pushTopics: string[];
    pushStatus: ConnectionStatus;
    pushConnected: boolean;
    pushLatest: unknown;
    createPushOptions(): Partial<EventStreamOptions>;
    onPushEvent(event: unknown): void;
  }> & T;
}
