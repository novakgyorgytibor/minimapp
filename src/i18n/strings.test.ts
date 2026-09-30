import { defaultLang, STRINGS } from './strings';

test('both languages define every string', () => {
  expect(Object.keys(STRINGS.hu).sort()).toEqual(Object.keys(STRINGS.en).sort());
  for (const lang of ['en', 'hu'] as const) {
    for (const [k, v] of Object.entries(STRINGS[lang])) expect([k, typeof v === 'string' && v.length > 0]).toEqual([k, true]);
  }
});

test.each([
  ['hu-HU', 'hu'],
  ['hu', 'hu'],
  ['en-GB', 'en'],
  ['de-DE', 'en'],
  [undefined, 'en'],
])('defaultLang(%p) = %p', (locale, lang) => {
  expect(defaultLang(locale)).toBe(lang);
});
