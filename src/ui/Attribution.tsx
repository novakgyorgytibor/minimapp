import { Linking, StyleSheet, Text } from 'react-native';
import appJson from '../../app.json';
import { theme } from '../theme';

/** A telepített verzió (a release-apk.sh minden buildnél emeli) – így látszik, melyik APK fut. */
export const APP_VERSION = appJson.expo.version;

export function Attribution() {
  return (
    <Text style={styles.text} onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
      OpenFreeMap © OpenMapTiles © OpenStreetMap · v{APP_VERSION}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.faint, fontSize: 9, position: 'absolute', left: 8, bottom: 4 },
});
