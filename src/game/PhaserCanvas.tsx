import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import type Phaser from 'phaser';

// Matches the old GameCanvas's root background — kept as a plain constant here (not imported from
// the old file) since that file's contents are being replaced piece by piece across several phases.
const BG_COLOR = '#0c0f16';

/** Phaser needs a real `<canvas>`, which only exists on the web build — native (iOS/Android) isn't
 * currently shipped for this game (no eas.json, unlike the sibling Wizard Chess project), so this
 * component is a no-op there rather than carrying a second renderer for a platform nobody's using. */
export default function PhaserCanvas() {
  const { width, height } = useWindowDimensions();
  const containerRef = useRef<View>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;

    (async () => {
      const [PhaserModule, { createMainScene }, { loadSpriteImages }] = await Promise.all([
        import('phaser').then((m) => m.default),
        import('@/game/phaser/mainScene'),
        import('@/game/phaser/loadSprites'),
      ]);
      // The character art is fetched before the game boots so the scene can register the textures
      // itself — Phaser's loader stalls partway through this many files.
      const spriteImages = await loadSpriteImages();
      const MainScene = createMainScene(PhaserModule, spriteImages);

      if (cancelled) return;
      // react-native-web forwards a View's ref to its underlying DOM node.
      const parent = containerRef.current as unknown as HTMLElement;
      gameRef.current = new PhaserModule.Game({
        type: PhaserModule.AUTO,
        parent,
        width,
        height,
        backgroundColor: BG_COLOR,
        // The character/sword art is 64x64 pixel art drawn several times larger than native, so the
        // default bilinear upscaling turns it to mush. Nearest-neighbour keeps the pixels crisp.
        pixelArt: true,
        scale: { mode: PhaserModule.Scale.NONE },
        scene: MainScene,
      });
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // Intentionally empty deps: the game boots once; size changes are handled by the effect below
    // via game.scale.resize instead of tearing the whole game down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.scale.resize(width, height);
  }, [width, height]);

  if (Platform.OS !== 'web') return null;

  return <View ref={containerRef} style={styles.root} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_COLOR, overflow: 'hidden' },
});
