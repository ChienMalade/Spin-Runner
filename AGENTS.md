# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project status (read this first, then check `git log` for anything newer)

**Spin-Runner** — a multiplayer .io-style arena game. Players fight with a ring of swords that
orbit and spin around them, growing stronger by picking up bonuses and by killing other players
(including bots). Client: Expo/React Native (web build). Server: Node + `ws`, authoritative
30Hz tick, serves the static web build AND the WebSocket on the same port.

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
- `src/game/GameCanvas.tsx` — all the View-based rendering: players, swords, particles/effects.
  This file is long; effects (lightning, spin trail, shield aura, speed afterimages, heart pulse)
  each live in their own clearly-commented block.
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
  leave), avoid map corners, flee shielded players (unless shielded themselves), always treat a
  swordless+shieldless target as easy prey regardless of size difference.
- **Visuals**: animated lightning arcs on sword blades (scale with sword tier), a motion trail on
  spinning swords (scales with spin speed), a pulsing shield aura + HP-bar blink (same pulse speed
  as the ready-dash blink, kept deliberately in sync for a consistent "pulsing" feel), a
  speed-buff afterimage trail, a heart-pickup healing pulse that follows the player who grabbed it.
  **A user preference to know**: don't change how existing effects/animations look or feel when
  asked to optimize performance — safe wins only (e.g. off-screen render culling was added; a
  shadow/segment-count reduction pass was tried and explicitly reverted because it changed the
  visuals).
- **Error boundary**: `src/ui/ErrorBoundary.tsx` wraps the app — an uncaught render error shows a
  reload screen instead of a blank page. Added after an unreproduced "white page" crash report
  tied to pushing dev-mode Rotation to 15; root cause was never confirmed.

## Working style notes for whoever picks this up

- The user (non-technical, testing live with friends) generally wants changes tested locally,
  then **pushed straight to production without asking** once they look right — say what you're
  about to do, but don't wait for a go-ahead on routine pushes during an active session.
- Verify a deploy actually went live (curl the URL and/or check Render logs) before telling the
  user it's done.
- The dev-panel's Pressable buttons are not reliably clickable via remote browser automation
  (React Native Web's touch-responder system doesn't respond to synthetic DOM MouseEvents) — to
  test something that needs a specific stat value, prefer connecting a raw `ws` client from a
  Node script and sending `{t:'dev', command:{...}}` directly, or write a small standalone script
  importing `GameWorld`/`entities.ts` functions and asserting on the results. Real keyboard events
  (`KeyboardEvent` dispatch) DO work for testing the dash key.
