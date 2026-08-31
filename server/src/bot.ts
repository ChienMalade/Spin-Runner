import { radiusFor, type ServerPlayer } from './entities.js';
import type { BonusEntity } from './gameLoop.js';

const SENSE_RADIUS = 900;
const FLEE_RADIUS = 340;
/** An enemy must be at least this much bigger to be treated as a threat (avoids flee/chase jitter
 * between near-equal-sized bots). */
const SIZE_THREAT_MARGIN = 1.12;

const wanderState = new WeakMap<ServerPlayer, { angle: number; until: number }>();

/** Bots always charge at the nearest bonus, player or rival bot — unless that target is
 * meaningfully bigger than them, in which case they ignore it, or flee it outright if it's close. */
export function updateBotInput(bot: ServerPlayer, players: ServerPlayer[], bonuses: BonusEntity[]) {
  if (!bot.alive) {
    bot.inputDx = 0;
    bot.inputDy = 0;
    return;
  }
  const selfRadius = radiusFor(bot);

  let nearestThreat: ServerPlayer | null = null;
  let nearestThreatDist = Infinity;
  let nearestPrey: { x: number; y: number } | null = null;
  let nearestPreyDist = Infinity;

  for (const p of players) {
    if (p === bot || !p.alive) continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    if (radiusFor(p) > selfRadius * SIZE_THREAT_MARGIN) {
      if (d < FLEE_RADIUS && d < nearestThreatDist) {
        nearestThreatDist = d;
        nearestThreat = p;
      }
      continue;
    }
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = p;
    }
  }

  for (const b of bonuses) {
    const d = Math.hypot(b.x - bot.x, b.y - bot.y);
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = b;
    }
  }

  if (nearestThreat) {
    steer(bot, bot.x - nearestThreat.x, bot.y - nearestThreat.y);
    return;
  }
  if (nearestPrey) {
    steer(bot, nearestPrey.x - bot.x, nearestPrey.y - bot.y);
    return;
  }

  const now = Date.now();
  let w = wanderState.get(bot);
  if (!w || now > w.until) {
    w = { angle: Math.random() * Math.PI * 2, until: now + 1500 + Math.random() * 1500 };
    wanderState.set(bot, w);
  }
  bot.inputDx = Math.cos(w.angle);
  bot.inputDy = Math.sin(w.angle);
}

function steer(bot: ServerPlayer, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  bot.inputDx = dx / len;
  bot.inputDy = dy / len;
}
