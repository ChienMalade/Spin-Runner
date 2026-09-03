/** Shared geometry for the top HUD row, so the stats panel and the gauges next to it line up and
 * stay exactly the same height instead of each guessing its own numbers. */

export const HUD_TOP = 20;
export const HUD_SIDE_MARGIN = 20;
/** Both top-left panels (stats, gauges) are pinned to this height. */
export const HUD_PANEL_HEIGHT = 74;
export const HUD_PANEL_GAP = 10;
export const LEVEL_PANEL_WIDTH = 132;
/** Where the gauges start: just right of the stats panel. */
export const GAUGES_LEFT = HUD_SIDE_MARGIN + LEVEL_PANEL_WIDTH + HUD_PANEL_GAP;
/** Keeps the gauges clear of the leaderboard on the right. */
export const GAUGES_RIGHT = 300;
