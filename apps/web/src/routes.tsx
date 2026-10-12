import { Navigate, Route, Routes } from 'react-router';
import { config } from './config';
import { LandingPage } from './landing/LandingPage';
import { PlaceOverview } from './places/PlaceOverview';
import { PlaceShell } from './places/PlaceShell';

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={<LandingPage demoUrl={config.demoUrl} repositoryUrl={config.repositoryUrl} />}
      />
      <Route path="/places" element={<PlaceShell />}>
        <Route index element={<Navigate replace to="/places/sao-paulo-bela-vista" />} />
        <Route path=":placeId" element={<PlaceOverview />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/places" />} />
    </Routes>
  );
}
