// 与 syumai/workers 的 durable-object-counter 示例采用相同组合方式：
// 普通 HTTP 请求由 Go WASM 处理，Cloudflare 专有的 Durable Object 与
// WebSocket Hibernation 生命周期由这一层平台桥接代码处理。
import goWorker from "./build/worker.mjs";

const ROOM_PATH = /^\/rooms\/([^/]+)\/connect$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(ROOM_PATH);

    if (!match) return goWorker.fetch(request, env, ctx);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "websocket upgrade required" }, 426);
    }

    const roomID = decodeURIComponent(match[1]);
    if (!SAFE_ID.test(roomID)) return json({ error: "invalid room id" }, 400);
    return env.ROOMS.getByName(roomID).fetch(request);
  },
};

export class ChatRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const name = (url.searchParams.get("name") || "匿名用户").slice(0, 24);
    if (!clientId || !SAFE_ID.test(clientId)) return json({ error: "invalid client id" }, 400);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ clientId, name });
    this.ctx.acceptWebSocket(server);

    this.send(server, { type: "welcome", clientId, peers: this.peers(server) });
    this.broadcast({ type: "peer-joined", peer: { id: clientId, name } }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, raw) {
    if (typeof raw !== "string" || raw.length > 1_100_000) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    const sender = socket.deserializeAttachment();
    if (!sender) return;

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 4000);
      if (!text) return;
      this.broadcast({
        type: "chat",
        id: String(message.id || crypto.randomUUID()),
        text,
        sender: { id: sender.clientId, name: sender.name },
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type === "signal" && typeof message.target === "string") {
      const target = this.find(message.target);
      if (target) this.send(target, {
        type: "signal",
        from: sender.clientId,
        fromName: sender.name,
        data: message.data,
      });
    }
  }

  webSocketClose(socket) { this.remove(socket); }
  webSocketError(socket) { this.remove(socket); }

  remove(socket) {
    const peer = socket.deserializeAttachment();
    if (peer) this.broadcast({ type: "peer-left", peerId: peer.clientId }, socket);
  }

  peers(except) {
    return this.ctx.getWebSockets().filter((socket) => socket !== except)
      .map((socket) => socket.deserializeAttachment()).filter(Boolean)
      .map((peer) => ({ id: peer.clientId, name: peer.name }));
  }

  find(clientId) {
    return this.ctx.getWebSockets().find(
      (socket) => socket.deserializeAttachment()?.clientId === clientId,
    );
  }

  broadcast(message, except) {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) { try { socket.send(encoded); } catch {} }
    }
  }

  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch {}
  }
}