import { pickHeading } from './heading';

test('moving fast: follows the course', () => {
  expect(pickHeading({ compass: 90, course: 180, speedMps: 2.5, last: null })).toBe(180);
});

test('standing or slow: follows the compass', () => {
  expect(pickHeading({ compass: 90, course: 180, speedMps: 0.5, last: null })).toBe(90);
  expect(pickHeading({ compass: 90, course: 180, speedMps: 1.99, last: null })).toBe(90);
});

test('fast but no valid course: compass', () => {
  expect(pickHeading({ compass: 45, course: -1, speedMps: 5, last: null })).toBe(45);
});

test('no compass (e.g. simulator): course when moving at all, else keep last', () => {
  expect(pickHeading({ compass: null, course: 270, speedMps: 1.2, last: 10 })).toBe(270);
  expect(pickHeading({ compass: null, course: 270, speedMps: 0.2, last: 10 })).toBe(10);
});

test('nothing known yet → null', () => {
  expect(pickHeading({ compass: null, course: null, speedMps: 0, last: null })).toBeNull();
  expect(pickHeading({ compass: -1, course: -1, speedMps: 0, last: null })).toBeNull();
});
