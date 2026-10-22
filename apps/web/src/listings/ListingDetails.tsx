import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { listingQuery, listingPropertyQuery } from '../places/place-queries';
import { PlaceReadError } from '../places/place-client';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';
import { LoadErrorState, LoadingState } from '../shared/SystemStates';
import { isPropertyId, propertyHref, validSearchReturn } from '../properties/property-navigation';
import { verifiedListingProperty } from './listing-context';
import { ListingPlate } from './ListingPlate';
import { ListingFacts, ListingValues } from './ListingFacts';
import { ListingHistory } from './ListingHistory';
import { ListingDescription } from './ListingDescription';
import { LocaleControls } from '../places/LocaleControls';

function ValidListing({ id }: { readonly id: string }) {
  const { t, i18n } = useTranslation('listing');
  const { t: shared } = useTranslation('shared');
  const locale = i18n.language as Locale;
  const read = useQuery(listingQuery(id));
  const listing = read.data?.listing;
  const context = useQuery({
    ...listingPropertyQuery(listing?.propertyId ?? ''),
    enabled: isPropertyId(listing?.propertyId),
  });
  const property = verifiedListingProperty(listing, context.data);
  const supplied = new URLSearchParams(useLocation().search).getAll('returnTo');
  const returnTo = supplied.length === 1 ? validSearchReturn(supplied[0]!) : null;
  return (
    <main className="property-details listing-details" id="listing-details">
      <div className="property-return">
        <Link
          className="btn btn--quiet"
          to={listing ? propertyHref(listing.propertyId, returnTo ?? '') : (returnTo ?? '/search')}
        >
          {listing ? t('back') : t('search')}
        </Link>
        <LocaleControls />
      </div>
      {listing ? (
        <ListingPlate listing={listing} property={property}>
          <div className="listing-context">
            <p className="small">
              <span className={`st${listing.status === 'active' ? ' st--ok' : ''}`}>
                {t(listing.status)}
              </span>{' '}
              {property
                ? t('publication', { total: property.property.listings.length })
                : context.isPending
                  ? t('contextLoading')
                  : t('contextUnknown')}
            </p>
            {context.isError || (!context.isPending && !property) ? (
              <LoadErrorState
                description={t('contextFailed')}
                retry={() => {
                  void context.refetch();
                }}
                {...(context.error instanceof PlaceReadError && context.error.requestId
                  ? { requestId: context.error.requestId }
                  : {})}
              />
            ) : null}
          </div>
        </ListingPlate>
      ) : null}
      {read.isPending ? <LoadingState label={t('loading')} /> : null}
      {read.isError ? (
        <div className="place-state">
          {!listing && read.error instanceof PlaceReadError && read.error.status === 404 ? (
            <h1>{t('missing')}</h1>
          ) : null}
          <LoadErrorState
            description={t('failed')}
            context={t('choose')}
            retry={() => {
              void read.refetch();
            }}
            {...(read.error instanceof PlaceReadError && read.error.requestId
              ? { requestId: read.error.requestId }
              : {})}
          />
        </div>
      ) : null}
      {listing && read.data ? (
        <div className="property-body listing-body">
          <p className="prov property-basis">
            <span className="tag tag--synthetic">{shared('synthetic')}</span>
            <span>
              {t('basis', {
                date: formatComputedAt(read.data.metadata.asOf, locale),
                version: read.data.metadata.fixtureVersion,
              })}
            </span>
          </p>
          <div className="property-pair listing-pair--facts">
            <ListingFacts listing={listing} />
            <ListingValues listing={listing} />
          </div>
          <div className="property-pair">
            <ListingHistory listing={listing} />
            <ListingDescription listing={listing} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

export function ListingDetails() {
  const { listingId } = useParams();
  const { t } = useTranslation('listing');
  return isPropertyId(listingId) ? (
    <ValidListing key={listingId} id={listingId} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalid')}</h1>
      <p>{t('choose')}</p>
      <Link className="btn" to="/search">
        {t('search')}
      </Link>
    </main>
  );
}
