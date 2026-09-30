import { applyCameraStop, cameraFor, maskMode } from './camera';

const pos: [number, number] = [19.04, 47.5];
const bbox: [number, number, number, number] = [19.0, 47.4, 19.1, 47.6];

test('idle follows position north-up', () => {
  expect(cameraFor({ phase: 'idle', pos, heading: 90, bbox: null, follow: true, northUp: false })).toMatchObject({
    center: pos, zoom: 18, bearing: 0, pitch: 0,
  });
});

test('not following → leave camera alone', () => {
  expect(cameraFor({ phase: 'idle', pos, heading: 0, bbox: null, follow: false, northUp: false })).toBeNull();
  expect(cameraFor({ phase: 'navigating', pos, heading: 0, bbox, follow: false, northUp: false })).toBeNull();
});

test('no position → leave camera alone (except preview with bbox)', () => {
  expect(cameraFor({ phase: 'idle', pos: null, heading: 0, bbox: null, follow: true, northUp: false })).toBeNull();
  expect(cameraFor({ phase: 'preview', pos: null, heading: 0, bbox, follow: true, northUp: false })).toMatchObject({ bounds: bbox });
});

test('preview fits the route', () => {
  expect(cameraFor({ phase: 'preview', pos, heading: 0, bbox, follow: true, northUp: false })).toMatchObject({ bounds: bbox });
});

test('navigating: heading-up, tilted, zoomed in', () => {
  expect(cameraFor({ phase: 'navigating', pos, heading: 123, bbox, follow: true, northUp: false })).toMatchObject({
    center: pos, zoom: 18.5, bearing: 123, pitch: 45,
  });
  expect(cameraFor({ phase: 'rerouting', pos, heading: 5, bbox, follow: true, northUp: false })).toMatchObject({ bearing: 5 });
});

describe('applyCameraStop', () => {
  const fakeRef = () => ({ easeTo: jest.fn(), fitBounds: jest.fn() });

  test('bounds stop → fitBounds with the rest as options', () => {
    const ref = fakeRef();
    const stop = cameraFor({ phase: 'preview', pos, heading: 0, bbox, follow: true, northUp: false })!;
    applyCameraStop(ref, stop);
    expect(ref.fitBounds).toHaveBeenCalledWith(bbox, expect.objectContaining({ duration: 800, padding: expect.any(Object) }));
    expect(ref.easeTo).not.toHaveBeenCalled();
  });

  test('center stop → easeTo', () => {
    const ref = fakeRef();
    const stop = cameraFor({ phase: 'navigating', pos, heading: 42, bbox, follow: true, northUp: false })!;
    applyCameraStop(ref, stop);
    expect(ref.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: pos, bearing: 42, zoom: 18.5 }));
    expect(ref.fitBounds).not.toHaveBeenCalled();
  });
});

test('north-up mode keeps bearing 0 while navigating', () => {
  expect(cameraFor({ phase: 'navigating', pos, heading: 123, bbox, follow: true, northUp: true })).toMatchObject({ bearing: 0 });
});

describe('maskMode', () => {
  test('route corridor while following a route', () => {
    expect(maskMode({ hasRoute: true, follow: true, hasView: true })).toBe('route');
  });
  test('panned away during navigation/preview → circle at screen center', () => {
    expect(maskMode({ hasRoute: true, follow: false, hasView: true })).toBe('center');
  });
  test('no route → circle at screen center', () => {
    expect(maskMode({ hasRoute: false, follow: true, hasView: true })).toBe('center');
  });
  test('nothing known yet → all black', () => {
    expect(maskMode({ hasRoute: false, follow: true, hasView: false })).toBe('none');
  });
});
