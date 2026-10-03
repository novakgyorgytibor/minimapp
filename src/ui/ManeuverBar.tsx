import { StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import type { Progress } from '../nav/progress';
import { theme } from '../theme';
import type { Route } from '../types';
import { formatDistance, maneuverDistanceShown } from './format';
import { laneArrow, lanesToShow, maneuverArrow, maneuverText, signInfo } from './maneuverText';

export function ManeuverBar({ route, progress, arrived }: { route: Route; progress: Progress | null; arrived: boolean }) {
  const { lang, t } = useLang();
  if (arrived) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.big}>{t('arrived')}</Text>
      </View>
    );
  }
  const idx = progress?.nextStepIndex ?? Math.min(1, route.steps.length - 1);
  const step = route.steps[idx];
  const dist = progress?.distToManeuverM ?? step.beginDistM;
  const lanes = lanesToShow(step, dist);
  const sign = signInfo(step);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.arrow}>{maneuverArrow(step)}</Text>
        <Text style={styles.big}>{formatDistance(maneuverDistanceShown(dist), lang)}</Text>
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {maneuverText(step, lang)}
      </Text>

      {lanes.length > 0 && (
        <View style={styles.lanes}>
          {lanes.map((lane, i) => (
            <Text key={i} style={[styles.lane, lane.valid ? styles.laneOn : styles.laneOff]}>
              {laneArrow(lane)}
            </Text>
          ))}
        </View>
      )}

      {sign && (
        <View style={styles.sign}>
          {sign.exit && <Text style={styles.exit}>{sign.exit}</Text>}
          {sign.refs.map((r) => (
            <Text key={r} style={styles.ref}>
              {r}
            </Text>
          ))}
          {sign.toward.length > 0 && (
            <Text style={styles.toward} numberOfLines={1}>
              {sign.toward.join(' · ')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  arrow: { color: theme.fg, fontSize: 44, fontWeight: '200', width: 44, textAlign: 'center' },
  big: { color: theme.fg, fontSize: 40, fontWeight: '200', fontVariant: ['tabular-nums'] },
  text: { color: theme.fg, fontSize: 20, fontWeight: '300', marginTop: 2 },
  lanes: { flexDirection: 'row', gap: 18, marginTop: 10 },
  lane: { fontSize: 28, fontWeight: '300' },
  laneOn: { color: theme.fg },
  laneOff: { color: theme.faint },
  sign: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'nowrap' },
  exit: { color: theme.bg, backgroundColor: theme.fg, fontSize: 14, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1 },
  ref: { color: theme.fg, fontSize: 14, borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 5, paddingVertical: 1 },
  toward: { color: theme.fg, fontSize: 15, fontWeight: '300', flexShrink: 1 },
});
