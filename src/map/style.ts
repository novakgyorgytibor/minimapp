import type { LineLayerSpecification, StyleSpecification } from '@maplibre/maplibre-react-native';
import { config } from '../config';
import { theme } from '../theme';
import type { Mode } from '../types';

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'track', 'busway'];
// OpenMapTiles 'path': járda, gyalogút, kerékpárút, lépcső – autós módban halványabb
const PATH = ['path'];

export const PATH_LAYER_ID = 'roads-path';
const MINOR_LAYER_ID = 'roads-minor';
const MAJOR_LAYER_ID = 'roads-major';

/** Útvonal nélküli illesztéshez szóba jövő úthálózat-rétegek: autóval a járdák/gyalogutak nélkül. */
export function roadLayerIds(mode: Mode): string[] {
  return mode === 'auto' ? [MINOR_LAYER_ID, MAJOR_LAYER_ID] : [PATH_LAYER_ID, MINOR_LAYER_ID, MAJOR_LAYER_ID];
}

export function pathOpacity(mode: Mode): number {
  return mode === 'auto' ? 0.4 : 1;
}

const roadLayer = (id: string, classes: string[], widths: [number, number, number]): LineLayerSpecification => ({
  id,
  type: 'line',
  source: 'omt',
  'source-layer': 'transportation',
  filter: ['match', ['get', 'class'], classes, true, false],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': theme.road,
    'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, widths[0], 15, widths[1], 19, widths[2]],
  },
});

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: { omt: { type: 'vector', url: config.tileJsonUrl } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': theme.bg } },
    roadLayer(PATH_LAYER_ID, PATH, [0.3, 1, 3]),
    roadLayer(MINOR_LAYER_ID, MINOR, [0.3, 1, 4]),
    roadLayer(MAJOR_LAYER_ID, MAJOR, [0.6, 2, 8]),
  ],
};
