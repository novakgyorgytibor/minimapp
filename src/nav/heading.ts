import { config } from '../config';

export interface HeadingInput {
  /** Iránytű (true heading, fok); null / negatív = nincs. */
  compass: number | null;
  /** GPS menetirány (fok); null / negatív = nincs. */
  course: number | null;
  speedMps: number;
  last: number | null;
}

const valid = (h: number | null): h is number => h !== null && h >= 0;

/** Állva az iránytű, gyors haladásnál a menetirány; iránytű nélkül mozgás közben a menetirány. */
export function pickHeading({ compass, course, speedMps, last }: HeadingInput): number | null {
  if (valid(course) && speedMps >= config.courseMinSpeedMps) return course;
  if (valid(compass)) return compass;
  if (valid(course) && speedMps >= 1) return course;
  return last;
}

/** A két irány közötti legkisebb szögkülönbség fokban (0..180), körbefordulással. */
export function angleDiff(a: number, b: number): number {
  return Math.abs(((b - a + 540) % 360) - 180);
}
