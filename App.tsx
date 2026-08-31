import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import GameRoot from '@/game/GameRoot';

export default function App() {
  return (
    <View style={styles.container}>
      <GameRoot />
      <StatusBar style="light" hidden />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0f16' },
});
