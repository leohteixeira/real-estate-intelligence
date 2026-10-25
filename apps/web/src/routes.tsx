import { Navigate, Route, Routes } from 'react-router';
import { PresentationRedirect } from './landing/PresentationRedirect';
import { PlaceOverview } from './places/PlaceOverview';
import { AppShell } from './shell/AppShell';
import { AskScreen } from './ask/AskScreen';
import { SearchResults } from './search/SearchResults';
import { PropertyDetails } from './properties/PropertyDetails';
import { ListingDetails } from './listings/ListingDetails';
import { defaultPlaceId, destinationPath, publicRoutes } from './shell/public-routes';
import { PrivacyNotice } from './privacy/PrivacyNotice';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PresentationRedirect />} />
      <Route element={<AppShell documentMode />}>
        <Route path="/privacy" element={<PrivacyNotice />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="/listings/:listingId" element={<ListingDetails />} />
        <Route path="/properties/:propertyId" element={<PropertyDetails />} />
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
                  <AskScreen />
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
