import { Navigate, Route, Routes } from 'react-router';
import { config } from './config';
import { LandingPage } from './landing/LandingPage';
import { PlaceOverview } from './places/PlaceOverview';
import { AppShell } from './shell/AppShell';
import { PlaceEntry } from './shell/PlaceEntry';
import { SearchResults } from './search/SearchResults';
import { defaultPlaceId, destinationPath, publicRoutes } from './shell/public-routes';

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={<LandingPage demoUrl={config.demoUrl} repositoryUrl={config.repositoryUrl} />}
      />
      <Route element={<AppShell />}>
        {publicRoutes.map(({ destination, path, parameterPath }) => (
          <Route key={destination} path={path}>
            <Route
              index
              element={<Navigate replace to={destinationPath(destination, defaultPlaceId)} />}
            />
            <Route
              path={parameterPath}
              element={
                destination === 'places' ? (
                  <PlaceOverview />
                ) : destination === 'search' ? (
                  <SearchResults />
                ) : (
                  <PlaceEntry destination={destination} />
                )
              }
            />
          </Route>
        ))}
      </Route>
      <Route path="*" element={<Navigate replace to="/places" />} />
    </Routes>
  );
}
