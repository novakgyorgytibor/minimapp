import { parseDevLink } from './devLink';

test('parses a navigate link with destination, label and autostart', () => {
  expect(parseDevLink('hu.minimapp.app://navigate?lat=47.3935&lon=18.9136&label=%C3%89rd&start=1')).toEqual({
    dest: [18.9136, 47.3935],
    label: 'Érd',
    start: true,
  });
});

test('label and start are optional', () => {
  expect(parseDevLink('hu.minimapp.app://navigate?lat=47.5&lon=19.04')).toEqual({ dest: [19.04, 47.5], label: 'Dev', start: false });
});

test('anything else is ignored', () => {
  expect(parseDevLink('hu.minimapp.app://other?lat=1&lon=2')).toBeNull();
  expect(parseDevLink('hu.minimapp.app://navigate?lat=abc&lon=2')).toBeNull();
  expect(parseDevLink('https://example.com')).toBeNull();
  expect(parseDevLink(null)).toBeNull();
});
