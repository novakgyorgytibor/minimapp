import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import { theme } from '../theme';

interface State {
  error: Error | null;
  /** Újraindításkor nő → a gyerekek újra létrejönnek (tiszta állapottal). */
  generation: number;
}

/**
 * Renderelési hiba esetén nem omlik össze az app: hibaüzenet + Újraindítás gomb, ami újra létrehozza a gyerekeket.
 * (Eseménykezelőkben, időzítőkben és a natív kódban keletkező hibákat nem kapja el.)
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  restart = () => this.setState((s) => ({ error: null, generation: s.generation + 1 }));

  render() {
    if (this.state.error) return <CrashScreen onRestart={this.restart} />;
    return <View key={this.state.generation} style={styles.fill}>{this.props.children}</View>;
  }
}

function CrashScreen({ onRestart }: { onRestart: () => void }) {
  const { t } = useLang();
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{t('crashText')}</Text>
      <Pressable onPress={onRestart} style={styles.button} testID="crash-restart">
        <Text style={styles.text}>{t('crashRestart')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  text: { color: theme.fg, fontSize: 18, textAlign: 'center' },
  button: { borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 24, paddingVertical: 10 },
});
