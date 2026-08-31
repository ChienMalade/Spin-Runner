import { WebSocketServer, type WebSocket } from 'ws';
import { ARENA_HEIGHT, ARENA_WIDTH, type ClientMessage, type ServerMessage } from './protocol.js';
import { ArenaManager, type Arena } from './arenaManager.js';

const PORT = Number(process.env.PORT) || 8787;
const TICK_HZ = 30;

const manager = new ArenaManager();
console.log(`Spin-Runner server listening on ws://localhost:${PORT}`);
console.log(`Arenas: ${manager.arenas.map((a) => a.code).join(', ')}`);

const wss = new WebSocketServer({ port: PORT });

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  let playerId: string | null = null;
  let arena: Arena | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.t === 'join') {
      const result = manager.join(ws, msg.name ?? 'Joueur', msg.hue, msg.arenaCode);
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
