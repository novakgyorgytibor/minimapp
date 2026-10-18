// @ts-expect-error: nincs típusdeklaráció a react-test-renderer-hez
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LangProvider } from '../i18n/LangContext';
import { ErrorBoundary } from './ErrorBoundary';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: () => Promise.resolve(null), setItem: () => Promise.resolve() }));

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <Text>ok</Text>;
}

test('a render error shows the restart screen instead of crashing, and restart remounts the children', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r!: any;
  await act(async () => {
    r = create(
      <LangProvider>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </LangProvider>,
    );
  });
  const texts = () => r.root.findAllByType(Text).map((t: { props: { children: unknown } }) => t.props.children);
  expect(texts()).not.toContain('ok');
  expect(r.root.findAllByProps({ testID: 'crash-restart' }).length).toBeGreaterThan(0);

  shouldThrow = false;
  await act(async () => r.root.findAllByProps({ testID: 'crash-restart' })[0].props.onPress());
  expect(texts()).toContain('ok');
  spy.mockRestore();
});
