import type { WebSocket } from 'ws';
import { GameWorld, MAX_TOTAL_PLAYERS } from './gameLoop.js';
import type { ServerPlayer } from './entities.js';

const ARENA_COUNT = 2;
// No 0/O/1/I — avoids ambiguity when a player reads a code out loud to a friend.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

function generateCode(taken: Set<string>): string {
  let code: string;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
      ''
    );
  } while (taken.has(code));
  return code;
}

export class Arena {
  code: string;
  world = new GameWorld();
  sockets = new Map<string, WebSocket>();

  constructor(code: string) {
    this.code = code;
  }
}

type JoinResult =
  | { ok: true; arena: Arena; player: ServerPlayer }
  | { ok: false; reason: 'server_full' | 'arena_full' | 'arena_not_found' };

/** Two arenas for now — enough to actually exercise the arena-code join path end to end. Player
 * ids/sword ids/etc. are minted from process-wide counters in entities.ts, so nothing collides
 * across arenas even though each one runs its own independent GameWorld. */
export class ArenaManager {
  arenas: Arena[] = [];

  constructor(arenaCount = ARENA_COUNT) {
    const taken = new Set<string>();
    for (let i = 0; i < arenaCount; i++) {
      const code = generateCode(taken);
      taken.add(code);
      this.arenas.push(new Arena(code));
    }
  }

  findByCode(code: string): Arena | undefined {
    const upper = code.trim().toUpperCase();
    return this.arenas.find((a) => a.code === upper);
  }

  /** No arena code given: fill the first arena with room before spilling into the next one. */
  private pickForAutoJoin(): Arena | undefined {
    return this.arenas.find((a) => a.world.players.size < MAX_TOTAL_PLAYERS);
  }

  join(ws: WebSocket, name: string, hue: number | undefined, arenaCode: string | undefined): JoinResult {
    let arena: Arena | undefined;
    if (arenaCode) {
      arena = this.findByCode(arenaCode);
      if (!arena) return { ok: false, reason: 'arena_not_found' };
      const player = arena.world.addHumanPlayer(ws, name, hue);
      if (!player) return { ok: false, reason: 'arena_full' };
      return { ok: true, arena, player };
    }

    arena = this.pickForAutoJoin();
    if (!arena) return { ok: false, reason: 'server_full' };
    const player = arena.world.addHumanPlayer(ws, name, hue);
    if (!player) return { ok: false, reason: 'server_full' };
    return { ok: true, arena, player };
  }
}
