import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

/** Két egymással szembe fordított háromszög: fehér = észak, szürke = dél. A térképpel együtt forog. */
export function Compass({ bearing }: { bearing: number }) {
  return (
    <View style={[styles.wrap, { transform: [{ rotate: `${-bearing}deg` }] }]} pointerEvents="none">
      <View style={[styles.tri, styles.north]} />
      <View style={[styles.tri, styles.south]} />
    </View>
  );
}

const W = 8;
const H = 14;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 2 * W, height: 2 * H },
  tri: {
    width: 0,
    height: 0,
    borderLeftWidth: W,
    borderRightWidth: W,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  north: { borderBottomWidth: H, borderBottomColor: theme.fg },
  south: { borderTopWidth: H, borderTopColor: theme.dim },
});
