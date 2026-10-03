import { Pressable, StyleSheet, Text } from 'react-native';
import { useLang } from '../i18n/LangContext';
import type { StringKey } from '../i18n/strings';
import type { RouteErrorKind } from '../services/route';
import { theme } from '../theme';

const MESSAGES: Record<RouteErrorKind, StringKey> = {
  network: 'errNetwork',
  'rate-limited': 'errRateLimited',
  'no-route': 'errNoRoute',
  'no-position': 'errNoPosition',
};

/**
 * cameraAhead: traffipax előttünk (ez a legfontosabb, mindent megelőz);
 * rerouting: navigáció közben letértünk, új útvonalat kérünk → „Újratervezés…”
 */
export function StatusLine({
  cameraAhead,
  error,
  loading,
  rerouting,
  onRetry,
}: {
  cameraAhead: boolean;
  error: RouteErrorKind | null;
  loading: boolean;
  rerouting: boolean;
  onRetry: () => void;
}) {
  const { t } = useLang();
  if (cameraAhead) return <Text style={styles.text}>{t('cameraAhead')}</Text>;
  if (rerouting) return <Text style={styles.text}>{t('rerouting')}</Text>;
  if (loading) return <Text style={styles.text}>{t('findingRoute')}</Text>;
  if (!error) return null;
  const retryable = error !== 'no-route';
  return (
    <Pressable onPress={retryable ? onRetry : undefined} hitSlop={12}>
      <Text style={styles.text}>{t(MESSAGES[error])}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.fg, fontSize: 15, textAlign: 'center', paddingVertical: 8 },
});
