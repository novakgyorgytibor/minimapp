import { applyCameraStop, cameraFor } from './camera';

const pos: [number, number] = [19.04, 47.5];
const bbox: [number, number, number, number] = [19.0, 47.4, 19.1, 47.6];

test('idle follows position north-up', () => {
  expect(cameraFor({ phase: 'idle', pos, heading: 90, bbox: null, follow: true })).toMatchObject({
    center: pos, zoom: 15, bearing: 0, pitch: 0,
  });
});

test('not following → leave camera alone', () => {
  expect(cameraFor({ phase: 'idle', pos, heading: 0, bbox: null, follow: false })).toBeNull();
  expect(cameraFor({ phase: 'navigating', pos, heading: 0, bbox, follow: false })).toBeNull();
});

test('no position → leave camera alone (except preview with bbox)', () => {
  expect(cameraFor({ phase: 'idle', pos: null, heading: 0, bbox: null, follow: true })).toBeNull();
  expect(cameraFor({ phase: 'preview', pos: null, heading: 0, bbox, follow: true })).toMatchObject({ bounds: bbox });
});

test('preview fits the route', () => {
  expect(cameraFor({ phase: 'preview', pos, heading: 0, bbox, follow: true })).toMatchObject({ bounds: bbox });
});

test('navigating: heading-up, tilted, zoomed in', () => {
  expect(cameraFor({ phase: 'navigating', pos, heading: 123, bbox, follow: true })).toMatchObject({
    center: pos, zoom: 17, bearing: 123, pitch: 45,
  });
  expect(cameraFor({ phase: 'rerouting', pos, heading: 5, bbox, follow: true })).toMatchObject({ bearing: 5 });
});

describe('applyCameraStop', () => {
  const fakeRef = () => ({ easeTo: jest.fn(), fitBounds: jest.fn() });

  test('bounds stop → fitBounds with the rest as options', () => {
    const ref = fakeRef();
    const stop = cameraFor({ phase: 'preview', pos, heading: 0, bbox, follow: true })!;
    applyCameraStop(ref, stop);
    expect(ref.fitBounds).toHaveBeenCalledWith(bbox, expect.objectContaining({ duration: 800, padding: expect.any(Object) }));
    expect(ref.easeTo).not.toHaveBeenCalled();
  });

  test('center stop → easeTo', () => {
    const ref = fakeRef();
    const stop = cameraFor({ phase: 'navigating', pos, heading: 42, bbox, follow: true })!;
    applyCameraStop(ref, stop);
    expect(ref.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: pos, bearing: 42, zoom: 17 }));
    expect(ref.fitBounds).not.toHaveBeenCalled();
  });
});
