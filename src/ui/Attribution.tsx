import { Linking, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';

export function Attribution() {
  return (
    <Text style={styles.text} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
      OpenFreeMap © OpenMapTiles © OpenStreetMap
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.faint, fontSize: 9, position: 'absolute', left: 8, bottom: 4 },
});
