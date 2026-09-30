import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

/** Két egymással szembe fordított háromszög: fehér = észak, szürke = dél. A térképpel együtt forog. */
export function Compass({ bearing, onPress }: { bearing: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={16}>
      <View style={[styles.wrap, { transform: [{ rotate: `${-bearing}deg` }] }]}>
        <View style={[styles.tri, styles.north]} />
        <View style={[styles.tri, styles.south]} />
      </View>
    </Pressable>
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
