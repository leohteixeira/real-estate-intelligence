import { config } from '../config';

/** Native internal anchors need the same base that React Router adds to its Links. */
export function publicHref(path: string, base = config.publicBase): string {
  return path.startsWith('/') && !path.startsWith('//') ? `${base}${path}` : path;
}
