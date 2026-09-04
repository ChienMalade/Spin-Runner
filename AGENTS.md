# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project status (read this first, then check `git log` for anything newer)

**Spin-Runner** — a multiplayer .io-style arena game. Players fight with a ring of swords that
orbit and spin around them, growing stronger by picking up bonuses and by killing other players
(including bots). Client: Expo/React Native shell with the **game itself rendered in Phaser 4**
on a canvas; the HUD stays React Native on top. Server: Node + `ws`, authoritative 30Hz tick,
serves the static web build AND the WebSocket on the same port.

- **Live**: https://spin-runner.onrender.com (Render, free tier, auto-deploys on push to `master`).
- **Repo**: https://github.com/ChienMalade/Spin-Runner — private.
- **Folder on disk**: `C:\Users\conta\Desktop\OrbitClash` (yes, mismatched vs. the repo/package
  name "spin-runner" — that's just the folder name, harmless, left as-is).

## How to run it locally

```
npx expo export -p web        # builds the client into dist/ (run from repo root)
cd server
PORT=8787 npx tsx src/index.ts
```
Then open `http://localhost:8787`. **Port 8787 specifically** — `src/net/socketUrl.ts` hardcodes
that port as the local-web fallback, so a different port means the browser can't find the
WebSocket. In production (non-localhost host) the client instead connects to `wss://` on the
same origin it was served from — no separate server needed there.

To push a change live: commit, `git push`, Render auto-deploys in ~1-2 min. Verify with
`curl -s -o /dev/null -w "%{http_code}" https://spin-runner.onrender.com/` (expect 200), or check
the Render dashboard logs for "Your service is live".

## Architecture map

- `server/src/index.ts` — Express + `ws`, static file serving (`dist/`, with `index.html` sent
  `Cache-Control: no-cache` so a tab open across a deploy still picks up new code), WS heartbeat
  (reaps dead connections so the server can't OOM from zombie sockets), the 30Hz tick loop.
- `server/src/gameLoop.ts` — `GameWorld`: movement, dash, combat, bonus spawning/pickup, bot
  population floor, leaderboard.
- `server/src/entities.ts` — `ServerPlayer` shape, all the stat-curve math (growth/spin/sword-tier
  multipliers, dash charge fill), constants.
- `server/src/bot.ts` — bot AI (chase/flee/wander, corner avoidance, flees shielded enemies,
  treats a swordless+shieldless enemy as free prey regardless of size).
- `server/src/arenaManager.ts` — fixed number of arenas per server instance, each with a 4-char
  join code.
- `server/src/protocol.ts` and `src/net/protocol.ts` — **the wire protocol, hand-duplicated**
  (not a shared package — a deliberate choice, "not worth the tooling overhead" for a two-package
  prototype). Keep both in sync by hand when the protocol changes.
- `src/game/PhaserCanvas.tsx` — boots the Phaser game into a DOM node and tears it down; web-only
  (Phaser needs a real `<canvas>`, so native builds render nothing).
- `src/game/phaser/mainScene.ts` — **the renderer**: characters + animations, swords, status auras,
  particles/bursts, camera, screen shake, cloud shadows, vignette. Reads `useGameStore.getState()`
  every frame; nothing here goes through React.
- `src/game/phaser/ground.ts` — paints the whole arena floor (grass, ground cover, edge wall) into
  ONE canvas texture, drawn in a single call. Read the comments before touching it: a two-tone Wang
  grass set and a 400px single grass texture were both generated, judged and dropped, and the file
  says why. Its hash uses `Math.imul` on purpose — the previous one multiplied past 2^53, lost its
  low bits, and made the scattered blades line up into diagonal streaks across the field.
- `src/game/phaser/loadSprites.ts` — loads the character/sword PNGs by hand. Phaser's own loader
  caps at 32 parallel files and **stalls** partway through the ~150 frames here (queue full, none
  in flight, no error, scene never reaches `create()`), so don't switch back to `this.load.image`.
- `src/game/phaser/spriteAssets.ts` — **generated**, do not hand-edit. Run `npm run generate:sprites`
  after changing anything in `assets/Character` or `assets/Map`. Metro needs a literal `require()`
  per file, hence the generation. `CharacterId` comes from the protocol, and CHARACTERS is typed as
  a full Record over it — so listing a character in the protocol without adding its art is a compile
  error, not a crash in the arena.
- `scripts/pixellab-map.mjs` — regenerates the arena art through the PixelLab API. **Costs credits**
  (the key is in `.env`, git-ignored). Run one group at a time: `ground`, `decor`, `border`.
- `src/game/GameCanvas.tsx` — the OLD React Native View renderer. No longer mounted anywhere;
  kept only as a reference while the Phaser port settles. Safe to delete once nothing is missed.
- `src/ui/HealthBar.tsx` — HP bar + dash-charge bar (now unified blue, no yellow).
- `src/ui/DevPanel.tsx` / `DevToggle.tsx` — name yourself "dev" in the lobby to get a dev panel
  (bot count, bonus density, stat overrides) for testing without grinding.

## Current game systems (as of the latest commit)

- **Dash**: simplified back down to just 3 stackable charges (no sprint/hold mechanic — that was
  tried, iterated on, and explicitly removed for being too complex/buggy; don't reintroduce a
  hold-to-sprint mechanic without being asked again). A charge's fill bar is blue, becomes usable
  the instant it completes (no hidden delay), then a ~1s pause before the next graduation starts.
  A ready (full) slot pulses continuously until spent. Press to fire — holding does nothing extra.
- **Leveling**: growth (size) 1–20, sword-tier and spin 1–15 (picking up sword/spin bonuses past
  their cap converts to **gold** instead — a tracked currency with no spend/use yet). Power curves
  are front-loaded through level 10 at the original pace, then accelerate to their cap.
- **Kills**: absorb the victim's growth/spin/sword-tier if theirs was higher, top up sword count
  by the difference, AND always gain growth progress proportional to the victim's own size even if
  they were smaller than you.
- **Bonuses**: 7 types kept in equal supply; picking one up immediately spawns a same-type
  replacement; placement prefers empty/under-served areas (avoids clustering, especially
  same-type clustering).
- **Bots**: population floor of 10 per arena (shrinks as real players join, backfills as they
  leave). They head for the nearest bonus or attackable player; attackable means weaker, or anyone
  at all when the bot's own shield is up, or anyone carrying neither sword nor shield regardless of
  size. They circle a player target at melee range (never a bonus — circling one meant they orbited
  it forever instead of picking it up). They avoid walls and corners.
  **A hard rule the user set**: a bot may never stay inside a ~150-unit radius for more than 3
  seconds. Enforced by the loiter check in `bot.ts` — after 1s of no progress it force-escapes and
  keeps escaping until it's 380 units clear, changing heading every 350ms if something blocks it.
  Both of those were measured with a throwaway `ws` probe; re-measure if you touch it.
- **Characters**: 8-directional 64x64 pixel art (idle rotations + run and dash animations) under
  `assets/Character`. Two so far, the knight and Pablo, picked in the lobby — the colour swatches
  are gone, and the hue is now assigned at random purely for the leaderboard dots. Bots pick at
  random. Both characters' opaque bounding boxes match to within a pixel, which is why one vertical
  offset constant still covers them; check that again before adding a differently-proportioned one.
- **Status auras**: a bonus shows as a **pixel outline** hugging the character: the sprite stamped 8
  times behind them, offsets measured in pixels of the SOURCE art (screen-pixel offsets vanish once
  art is upscaled 3-4x), with `TintMode.FILL` — plain `setTint` multiplies and turns the near-black
  armour navy instead of bright blue. Silhouette-based, so any future character gets a correct
  outline with nothing to configure. Up to **three concentric rings** show at once, one flat colour
  each (never blended): blue shield, green speed, and one-second flashes for heart (red), sword
  upgrade (yellow) and spin (purple). Shield and speed blink through their last second, each on its
  own clock. With one bonus active every ring takes its colour, which reads as a single thick glow.
  **A user preference to know**: don't change how existing effects/animations look or feel when
  asked to optimize performance — safe wins only.
- **The floor**: real art, baked once into a single 2816x2816 texture (see `ground.ts`). Drop
  shadows under every character, drifting cloud shadows and a screen vignette are all code, no art.
  A hard rule from the user: **no obstacles** — every decoration is flat and traversable, and the
  collision boundary stays the server's rectangle.
- **Pixel art must stay crisp**: the game runs with `pixelArt: true` and every texture forced to
  `FilterMode.NEAREST`. Without it, characters blur badly as they grow (default bilinear upscaling).
- **Error boundary**: `src/ui/ErrorBoundary.tsx` wraps the app — an uncaught render error shows a
  reload screen instead of a blank page. Added after an unreproduced "white page" crash report
  tied to pushing dev-mode Rotation to 15; root cause was never confirmed.

## Working style notes for whoever picks this up

- The user (non-technical, testing live with friends) generally wants changes tested locally,
  then **pushed straight to production without asking** once they look right — say what you're
  about to do, but don't wait for a go-ahead on routine pushes during an active session.
- Verify a deploy actually went live (curl the URL and/or check Render logs) before telling the
  user it's done.
- **Sword geometry is driven by the server.** The client sizes the sword sprite from the
  `swordRadius` the server sends, so what you see is what actually collides — they drifted apart
  once and the user noticed immediately. Tune reach via `BASE_SWORD_RADIUS` / `BASE_SWORD_ORBIT_RADIUS`
  in `entities.ts`, never by scaling the sprite on the client.
- Sword collision radius went 8 → 23 during the sprite work, which noticeably lengthened everyone's
  reach. Flagged to the user, not yet judged in real play — revisit if combat feels too swingy.
- The dev-panel's Pressable buttons are not reliably clickable via remote browser automation
  (React Native Web's touch-responder system doesn't respond to synthetic DOM MouseEvents) — to
  test something that needs a specific stat value, prefer connecting a raw `ws` client from a
  Node script and sending `{t:'dev', command:{...}}` directly, or write a small standalone script
  importing `GameWorld`/`entities.ts` functions and asserting on the results. Real keyboard events
  (`KeyboardEvent` dispatch) DO work for testing the dash key.
