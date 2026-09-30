import { locationOptions } from './power';

test('navigation: highest accuracy, every second / 2 m', () => {
  expect(locationOptions(true)).toEqual({ accuracy: 'navigation', timeInterval: 1000, distanceInterval: 2 });
});

test('idle / preview: balanced accuracy, every 5 s / 10 m', () => {
  expect(locationOptions(false)).toEqual({ accuracy: 'balanced', timeInterval: 5000, distanceInterval: 10 });
});
