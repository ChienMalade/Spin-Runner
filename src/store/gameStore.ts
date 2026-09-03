import { create } from 'zustand';
import { getSocketUrl } from '@/net/socketUrl';
import { setMuted } from '@/audio/sounds';
import type {
  ArenaInfo,
  BonusState,
  CharacterId,
  ClientMessage,
  DevCommand,
  EffectState,
  LeaderboardEntry,
  PlayerState,
  ServerMessage,
} from '@/net/protocol';

interface GameStoreState {
  connected: boolean;
  joined: boolean;
  playerId: string | null;
  arenaCode: string | null;
  arena: ArenaInfo | null;
  players: PlayerState[];
  bonuses: BonusState[];
  effects: EffectState[];
  tick: number;
  bonusDensityLevel: number;
  leaderboard: LeaderboardEntry[];
  top1Since: number;
  dead: boolean;
  full: boolean;
  fullReason: 'server_full' | 'arena_full' | 'arena_not_found' | null;
  inputDx: number;
  inputDy: number;
  sprint: boolean;
  muted: boolean;
  devMode: boolean;
  settingsOpen: boolean;
  showNames: boolean;
  connect: () => void;
  join: (name: string, hue: number, character: CharacterId, arenaCode?: string) => void;
  updateInput: (partial: { dx?: number; dy?: number; sprint?: boolean }) => void;
  retry: () => void;
  toggleMuted: () => void;
  toggleDevMode: () => void;
  toggleSettingsOpen: () => void;
  toggleShowNames: () => void;
  sendDevCommand: (command: DevCommand) => void;
}

let socket: WebSocket | null = null;
let pendingJoin: { name: string; hue: number; character: CharacterId; arenaCode?: string } | null = null;

function sendMessage(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

export const useGameStore = create<GameStoreState>()((set, get) => ({
  connected: false,
  joined: false,
  playerId: null,
  arenaCode: null,
  arena: null,
  players: [],
  bonuses: [],
  effects: [],
  tick: 0,
  bonusDensityLevel: 5,
  leaderboard: [],
  top1Since: 0,
  dead: false,
  full: false,
  fullReason: null,
  inputDx: 0,
  inputDy: 0,
  sprint: false,
  muted: false,
  devMode: false,
  settingsOpen: false,
  showNames: true,

  connect: () => {
    if (socket) return;
    const ws = new WebSocket(getSocketUrl());
    socket = ws;

    ws.onopen = () => {
      set({ connected: true });
      if (pendingJoin) {
        sendMessage({
          t: 'join',
          name: pendingJoin.name,
          hue: pendingJoin.hue,
          character: pendingJoin.character,
          arenaCode: pendingJoin.arenaCode,
        });
        pendingJoin = null;
      }
    };
    ws.onclose = () => {
      set({ connected: false, joined: false });
      socket = null;
    };
    ws.onmessage = (evt) => {
      const msg: ServerMessage = JSON.parse(evt.data);
      if (msg.t === 'welcome') {
        set({
          playerId: msg.playerId,
          arena: msg.arena,
          arenaCode: msg.arenaCode,
          dead: false,
          joined: true,
        });
      } else if (msg.t === 'state') {
        set({
          players: msg.players,
          bonuses: msg.bonuses,
          effects: msg.effects,
          tick: msg.tick,
          bonusDensityLevel: msg.bonusDensityLevel,
          leaderboard: msg.leaderboard,
          top1Since: msg.top1Since,
        });
      } else if (msg.t === 'dead') {
        set({ dead: true });
      } else if (msg.t === 'full') {
        set({ full: true, fullReason: msg.reason });
      }
    };
  },

  join: (name, hue, character, arenaCode) => {
    set({ full: false, fullReason: null });
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendMessage({ t: 'join', name, hue, character, arenaCode });
    } else {
      pendingJoin = { name, hue, character, arenaCode };
    }
  },

  updateInput: (partial) => {
    if (!get().playerId) return;
    const dx = partial.dx ?? get().inputDx;
    const dy = partial.dy ?? get().inputDy;
    const sprint = partial.sprint ?? get().sprint;
    set({ inputDx: dx, inputDy: dy, sprint });
    sendMessage({ t: 'input', dx, dy, sprint });
  },

  retry: () => {
    set({ dead: false });
    sendMessage({ t: 'retry' });
  },

  toggleMuted: () => {
    const next = !get().muted;
    setMuted(next);
    set({ muted: next });
  },

  toggleDevMode: () => {
    set({ devMode: !get().devMode });
  },

  toggleSettingsOpen: () => {
    set({ settingsOpen: !get().settingsOpen });
  },

  toggleShowNames: () => {
    set({ showNames: !get().showNames });
  },

  sendDevCommand: (command) => {
    sendMessage({ t: 'dev', command });
  },
}));
