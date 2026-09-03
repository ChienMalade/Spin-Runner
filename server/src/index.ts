import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { ARENA_HEIGHT, ARENA_WIDTH, type ClientMessage, type ServerMessage } from './protocol.js';
import { ArenaManager, type Arena } from './arenaManager.js';

const PORT = Number(process.env.PORT) || 8787;
const TICK_HZ = 30;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `expo export -p web` (run at the repo root as part of the Render build) drops its static bundle
// in ../../dist relative to this file (server/src -> server -> repo root -> dist).
const STATIC_DIR = path.join(__dirname, '../../dist');

const manager = new ArenaManager();

const app = express();
// The HTML entry point references that build's specific hashed JS bundle by name — if a browser
// caches index.html itself (common heuristic-caching behavior with no explicit header), a returning
// player can get stuck on old UI code indefinitely after a deploy even though the server has moved
// on. Hashed assets (_expo/static/...) are safe to cache hard since their filename changes on every
// build; index.html always needs a fresh check.
const noCacheHtml = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
};
app.use(express.static(STATIC_DIR, { setHeaders: (res, filePath) => {
  if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
} }));
// Catch-all SPA fallback. Express 5's route-pattern wildcard ('*') no longer matches bare paths, so
// this uses a path-less middleware instead of app.get('*', ...).
app.use(noCacheHtml, (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// A dropped connection (phone locks, wifi dies, laptop sleeps) doesn't always deliver a clean close
// handshake, especially through a proxy — left unchecked, that socket (and its player) never gets
// cleaned up and just accumulates forever. Standard fix: ping everyone periodically and terminate
// whoever didn't pong back since the last check, which forces their 'close' handler to fire.
const HEARTBEAT_INTERVAL_MS = 30000;
interface HeartbeatWebSocket extends WebSocket {
  isAlive?: boolean;
}

wss.on('connection', (ws: HeartbeatWebSocket) => {
  let playerId: string | null = null;
  let arena: Arena | null = null;

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.t === 'join') {
      const result = manager.join(ws, msg.name ?? 'Joueur', msg.hue, msg.character, msg.arenaCode);
      if (!result.ok) {
        send(ws, { t: 'full', reason: result.reason });
        return;
      }
      arena = result.arena;
      playerId = result.player.id;
      arena.sockets.set(playerId, ws);
      send(ws, {
        t: 'welcome',
        playerId: result.player.id,
        arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
        arenaCode: arena.code,
      });
      return;
    }
    if (!playerId || !arena) return;
    if (msg.t === 'input') {
      arena.world.setInput(playerId, msg.dx, msg.dy, msg.sprint);
    } else if (msg.t === 'retry') {
      arena.world.retry(playerId);
    } else if (msg.t === 'dev') {
      arena.world.handleDevCommand(playerId, msg.command);
    }
  });

  ws.on('close', () => {
    if (playerId && arena) {
      arena.world.removePlayer(playerId);
      arena.sockets.delete(playerId);
    }
  });
});

setInterval(() => {
  for (const client of wss.clients as Set<HeartbeatWebSocket>) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dtSec = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  for (const arena of manager.arenas) {
    const { message, deaths } = arena.world.tick(dtSec);
    const payload = JSON.stringify(message);
    for (const ws of arena.sockets.values()) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    for (const id of deaths) {
      const ws = arena.sockets.get(id);
      if (ws) send(ws, { t: 'dead' });
    }
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => {
  console.log(`Spin-Runner server listening on http://localhost:${PORT}`);
  console.log(`Arenas: ${manager.arenas.map((a) => a.code).join(', ')}`);
});
