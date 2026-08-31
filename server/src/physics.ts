import type { SwordState } from './protocol.js';
import { orbitRadiusFor, type ServerPlayer } from './entities.js';

export interface Vec2 {
  x: number;
  y: number;
}

export function swordPosition(p: ServerPlayer, sword: SwordState): Vec2 {
  const angle = p.swordOrbitAngle + sword.angleOffset;
  const r = orbitRadiusFor(p);
  return { x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  return dist(ax, ay, bx, by) < ar + br;
}

export function clampToArena(x: number, y: number, r: number, width: number, height: number): Vec2 {
  return { x: Math.min(width - r, Math.max(r, x)), y: Math.min(height - r, Math.max(r, y)) };
}
