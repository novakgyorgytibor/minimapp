import type { LineLayerSpecification, StyleSpecification } from '@maplibre/maplibre-react-native';
import { config } from '../config';
import { theme } from '../theme';

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const MINOR = ['minor', 'service', 'track', 'path', 'busway'];

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
    roadLayer('roads-minor', MINOR, [0.3, 1, 4]),
    roadLayer('roads-major', MAJOR, [0.6, 2, 8]),
  ],
};
