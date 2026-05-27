import { StyleSheet, View, type ViewProps } from 'react-native';
import { GlassSurface } from './GlassSurface';

type Props = ViewProps & {
  height?: number;
  paddingHorizontal?: number;
};

/**
 * Pill-shaped glass surface used for floating header chrome (e.g. a back
 * chevron, or a paired star + ellipsis on the artist hero). Children are
 * laid out horizontally and centered.
 */
export function GlassCapsule({
  height = 38,
  paddingHorizontal = 12,
  style,
  children,
  ...rest
}: Props) {
  const radius = height / 2;
  return (
    <View
      style={[
        styles.wrap,
        { height, borderRadius: radius, paddingHorizontal },
        style,
      ]}
      {...rest}
    >
      <GlassSurface style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    gap: 12,
  },
});
