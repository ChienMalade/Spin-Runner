import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = 8787;

/** Same-machine web preview uses localhost; native devices need the dev-server LAN host. A deployed
 * web build (served by the game server itself, see server/src/index.ts) instead talks back to
 * whatever host/protocol it was loaded from, since the WS endpoint lives on that same origin there. */
export function getSocketUrl(): string {
  if (Platform.OS === 'web') {
    const { hostname, protocol, host } = window.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}`;
    }
    return `ws://localhost:${PORT}`;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || 'localhost';
  return `ws://${host}:${PORT}`;
}
