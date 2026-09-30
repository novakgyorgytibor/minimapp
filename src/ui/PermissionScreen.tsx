import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function PermissionScreen({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>A navigációhoz szükség van a pozíciódra.</Text>
      <Pressable onPress={onRequest} style={styles.button}>
        <Text style={styles.text}>Engedélyezés</Text>
      </Pressable>
      <Text style={styles.link} onPress={() => Linking.openSettings()}>Beállítások</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  text: { color: theme.fg, fontSize: 18, textAlign: 'center' },
  button: { borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 24, paddingVertical: 10 },
  link: { color: theme.dim, fontSize: 14 },
});
