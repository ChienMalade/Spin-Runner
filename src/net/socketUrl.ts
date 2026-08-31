import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORT = 8787;

/** Same-machine web preview uses localhost; native devices need the dev-server LAN host. */
export function getSocketUrl(): string {
  if (Platform.OS === 'web') return `ws://localhost:${PORT}`;
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || 'localhost';
  return `ws://${host}:${PORT}`;
}
