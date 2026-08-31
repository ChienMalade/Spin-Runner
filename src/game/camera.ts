import type { PlayerState } from '@/net/protocol';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const BASE_ZOOM = 1.2;
const ZOOM_FALLOFF = 0.09;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.2;

/** Camera stays centered on the local player and dezooms progressively as they grow. */
export function computeCamera(localPlayer: PlayerState | null): Camera {
  if (!localPlayer) return { x: 0, y: 0, zoom: BASE_ZOOM };
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, BASE_ZOOM / (1 + localPlayer.growthTier * ZOOM_FALLOFF)));
  return { x: localPlayer.x, y: localPlayer.y, zoom };
}

export function worldToScreen(wx: number, wy: number, cam: Camera, viewW: number, viewH: number) {
  return { x: (wx - cam.x) * cam.zoom + viewW / 2, y: (wy - cam.y) * cam.zoom + viewH / 2 };
}
