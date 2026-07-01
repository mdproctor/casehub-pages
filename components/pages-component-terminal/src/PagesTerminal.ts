import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export interface TerminalProps {
  wsUrl: string;
  fontSize?: number;
  fontFamily?: string;
  scrollback?: number;
  cursorBlink?: boolean;
  theme?: Partial<ITheme>;
}

export class PagesTerminal extends HTMLElement {
  private _props: TerminalProps | undefined;
  private _terminal: Terminal | undefined;
  private _fitAddon: FitAddon | undefined;
  private _ws: WebSocket | undefined;
  private _resizeObserver: ResizeObserver | undefined;
  private _reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private _retries = 0;
  private _tearingDown = false;
  private _onDataDisposable: { dispose(): void } | undefined;
  private _onResizeDisposable: { dispose(): void } | undefined;
  private _connected = false;

  configure(props: TerminalProps): void {
    this._props = props;
    if (this._connected) {
      this._teardown();
      this._init();
    }
  }

  connectedCallback(): void {
    this._connected = true;
    if (this._props) {
      this._init();
    }
  }

  disconnectedCallback(): void {
    this._connected = false;
    this._teardown();
  }

  sendInput(text: string): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(text);
    }
  }

  paste(text: string): void {
    this._terminal?.paste(text);
  }

  get terminal(): Terminal | undefined {
    return this._terminal;
  }

  private _init(): void {
    const props = this._props;
    if (!props) return;

    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    this.appendChild(container);

    const terminal = new Terminal({
      fontSize: props.fontSize ?? 14,
      fontFamily: props.fontFamily ?? "Menlo, Monaco, Consolas, monospace",
      scrollback: props.scrollback ?? 5000,
      cursorBlink: props.cursorBlink ?? true,
      ...(props.theme ? { theme: props.theme } : {}),
    });
    this._terminal = terminal;

    terminal.open(container);

    const fitAddon = new FitAddon();
    this._fitAddon = fitAddon;
    terminal.loadAddon(fitAddon);
    fitAddon.fit();

    this._onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (this._tearingDown) return;
      this._dispatchEvent("terminal-resize", { cols, rows });
    });

    this._resizeObserver = new ResizeObserver(() => {
      if (this._tearingDown) return;
      fitAddon.fit();
      if (terminal.cols > 0 && terminal.rows > 0 && !this._ws) {
        this._dispatchEvent("terminal-ready", { cols: terminal.cols, rows: terminal.rows });
        this._connect();
      }
    });
    this._resizeObserver.observe(container);

    if (terminal.cols > 0 && terminal.rows > 0) {
      this._dispatchEvent("terminal-ready", { cols: terminal.cols, rows: terminal.rows });
      this._connect();
    }
  }

  private _connect(): void {
    const props = this._props;
    const terminal = this._terminal;
    if (!props || !terminal) return;

    const url = props.wsUrl
      .replace("{cols}", String(terminal.cols))
      .replace("{rows}", String(terminal.rows));

    const ws = new WebSocket(url);
    this._ws = ws;

    ws.onopen = () => {
      this._retries = 0;
      this._dispatchEvent("terminal-connected", {});
    };

    ws.onmessage = (event: MessageEvent) => {
      terminal.write(event.data as string);
    };

    this._onDataDisposable = terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ws.onclose = (event: CloseEvent) => {
      this._ws = undefined;
      this._onDataDisposable?.dispose();
      this._onDataDisposable = undefined;

      if (!this._connected || this._tearingDown) return;

      if (event.code === 4001) {
        this._dispatchEvent("terminal-disconnected", { reason: "session-expired" });
        return;
      }

      this._dispatchEvent("terminal-disconnected", { reason: "connection-lost" });
      this._scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private _scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this._retries), 30000);
    this._retries++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      if (!this._connected || this._tearingDown) return;

      this._fitAddon?.fit();
      const terminal = this._terminal;
      if (!terminal || terminal.cols === 0 || terminal.rows === 0) return;

      terminal.reset();
      this._connect();
    }, delay);
  }

  private _teardown(): void {
    this._tearingDown = true;

    if (this._reconnectTimer !== undefined) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }

    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close(1000);
      this._ws = undefined;
    }

    this._onDataDisposable?.dispose();
    this._onDataDisposable = undefined;
    this._onResizeDisposable?.dispose();
    this._onResizeDisposable = undefined;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._terminal?.dispose();
    this._terminal = undefined;
    this._fitAddon = undefined;
    this._retries = 0;
    this.innerHTML = "";

    this._tearingDown = false;
  }

  private _dispatchEvent(topic: string, payload: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent("pages-event", {
      bubbles: true,
      composed: true,
      detail: { topic, payload },
    }));
  }
}

customElements.define("pages-component-terminal", PagesTerminal);
