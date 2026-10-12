export const defaultPlaceId = 'sao-paulo-bela-vista';
export type PublicDestination = 'places' | 'search' | 'ask';
export interface PublicRoute {
  readonly destination: PublicDestination;
  readonly path: `/${PublicDestination}`;
  readonly parameterPath: `/${PublicDestination}/:placeId`;
}
export const publicRoutes: readonly PublicRoute[] = [
  { destination: 'places', path: '/places', parameterPath: '/places/:placeId' },
  { destination: 'search', path: '/search', parameterPath: '/search/:placeId' },
  { destination: 'ask', path: '/ask', parameterPath: '/ask/:placeId' },
];
export function destinationPath(destination: PublicDestination, placeId: string): string {
  return `/${destination}/${placeId}`;
}
