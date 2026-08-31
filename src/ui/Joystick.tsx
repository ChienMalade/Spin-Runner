import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { isMobileDevice } from '@/game/isMobileDevice';

const BASE_RADIUS = 55;

export default function Joystick() {
  const updateInput = useGameStore((s) => s.updateInput);
  const mobile = useRef(isMobileDevice()).current;
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        origin.current = { x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY };
      },
      onPanResponderMove: (evt) => {
        const dx = evt.nativeEvent.locationX - origin.current.x;
        const dy = evt.nativeEvent.locationY - origin.current.y;
        const len = Math.hypot(dx, dy) || 1;
        const clampedLen = Math.min(len, BASE_RADIUS);
        setThumb({ x: (dx / len) * clampedLen, y: (dy / len) * clampedLen });
        updateInput({ dx: dx / len, dy: dy / len });
      },
      onPanResponderRelease: () => {
        setThumb({ x: 0, y: 0 });
        updateInput({ dx: 0, dy: 0 });
      },
      onPanResponderTerminate: () => {
        setThumb({ x: 0, y: 0 });
        updateInput({ dx: 0, dy: 0 });
      },
    })
  ).current;

  if (!mobile) return null;

  return (
    <View style={styles.zone} {...panResponder.panHandlers}>
      <View style={styles.base}>
        <View style={[styles.thumb, { transform: [{ translateX: thumb.x }, { translateY: thumb.y }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    left: 20,
    bottom: 36,
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
