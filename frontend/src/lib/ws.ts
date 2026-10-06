// WebSocket client: one connection per tab, auto-reconnect with exponential backoff,
// a ping every 25s so proxies (Render, browsers) don't drop an idle socket.

export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws").replace(/\/$/, "");

export type SocketStatus = "connecting" | "open" | "closed";
export interface ServerFrame {
  type: string;
  payload: unknown;
}

type FrameHandler = (frame: ServerFrame) => void;
type StatusHandler = (status: SocketStatus) => void;

const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
/** Backend closes with this code when the token is invalid. */
const CLOSE_UNAUTHORIZED = 4401;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private frameHandlers = new Set<FrameHandler>();
  private statusHandlers = new Set<StatusHandler>();
  status: SocketStatus = "closed";
  onUnauthorized: (() => void) | null = null;

  connect(token: string): void {
    this.token = token;
    this.attempts = 0;
    this.open();
  }

  /** Close for good (logout). No reconnect. */
  disconnect(): void {
    this.token = null;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("closed");
  }

  /** Returns false if the socket isn't open; callers keep the data and retry on reconnect. */
  send(type: string, payload: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, payload }));
    return true;
  }

  onFrame(handler: FrameHandler): () => void {
    this.frameHandlers.add(handler);
    return () => this.frameHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** Skip the backoff wait (e.g. the browser just came back online). */
  reconnectNow(): void {
    if (this.token && this.status === "closed") {
      this.attempts = 0;
      this.open();
    }
  }

  private open(): void {
    if (!this.token) return;
    this.clearTimers();
    this.setStatus("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus("open");
      this.pingTimer = setInterval(() => this.send("ping", {}), PING_INTERVAL_MS);
    };
    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data as string) as ServerFrame;
        this.frameHandlers.forEach((h) => h(frame));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (event) => {
      this.ws = null;
      this.clearTimers();
      this.setStatus("closed");
      if (event.code === CLOSE_UNAUTHORIZED) {
        this.token = null;
        this.onUnauthorized?.();
        return;
      }
      this.scheduleReconnect();
    };
    // onerror is always followed by onclose, which handles reconnecting.
  }

  private scheduleReconnect(): void {
    if (!this.token) return;
    // 1s, 2s, 4s ... capped at 30s, plus jitter so many clients don't reconnect in lockstep.
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts) + Math.random() * 500;
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  private setStatus(status: SocketStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }
}

/** The single client shared by the whole app. */
export const realtime = new RealtimeClient();
