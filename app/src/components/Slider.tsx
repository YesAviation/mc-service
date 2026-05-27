import { useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  value: number;
  max: number;
  onSlidingStart?: () => void;
  onSlidingComplete?: (value: number) => void;
  trackHeight?: number;
};

export function Slider({ value, max, onSlidingStart, onSlidingComplete, trackHeight = 4 }: Props) {
  const { colors } = useTheme();
  const widthRef = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onSlidingStart?.();
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
        setDrag(ratio * max);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
        setDrag(ratio * max);
      },
      onPanResponderRelease: (e) => {
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(1, x / Math.max(1, widthRef.current)));
        const v = ratio * max;
        setDrag(null);
        onSlidingComplete?.(v);
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  const displayed = drag ?? value;
  const ratio = max > 0 ? Math.max(0, Math.min(1, displayed / max)) : 0;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View
      onLayout={onLayout}
      {...responder.panHandlers}
      style={styles.touch}
    >
      <View
        style={[
          styles.track,
          { height: trackHeight, backgroundColor: colors.separator, borderRadius: trackHeight / 2 },
        ]}
      >
        <View
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            backgroundColor: colors.text,
            borderRadius: trackHeight / 2,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { paddingVertical: 14, justifyContent: 'center' },
  track: { width: '100%', overflow: 'hidden' },
});
