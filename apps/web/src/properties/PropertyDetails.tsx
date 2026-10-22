import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { propertyQuery } from '../places/place-queries';
import { PlaceReadError } from '../places/place-client';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';
import { LoadErrorState, LoadingState } from '../shared/SystemStates';
import { isPropertyId, propertyNeighborhood, validSearchReturn } from './property-navigation';
import { PropertyPlate } from './PropertyPlate';
import { PropertyPrices } from './PropertyPrices';
import { PropertyHistory } from './PropertyHistory';
import { PropertyLifelines } from './PropertyLifelines';
import { PropertyEvidence } from './PropertyEvidence';
import { PropertyFeatures } from './PropertyFeatures';
import { PropertyProvenance } from './PropertyProvenance';

function ValidProperty({ id }: { readonly id: string }) {
  const { t, i18n } = useTranslation('property');
  const locale = i18n.language as Locale;
  const read = useQuery(propertyQuery(id));
  const params = new URLSearchParams(useLocation().search);
  const supplied = params.getAll('returnTo');
  const returnTo = supplied.length === 1 ? validSearchReturn(supplied[0]!) : null;
  const response = read.data;
  const neighborhood = response ? propertyNeighborhood(response.property.summary) : undefined;
  return (
    <main className="property-details" id="property-details">
      <div className="property-return">
        <Link
          className="btn btn--quiet"
          to={returnTo ?? (neighborhood ? `/search/${neighborhood.id}` : '/search')}
        >
          {t('back')}
        </Link>
      </div>
      {response ? <PropertyPlate response={response} /> : null}
      {read.isPending ? <LoadingState label={t('loading')} /> : null}
      {read.isError ? (
        <div className="place-state">
          {read.error instanceof PlaceReadError && read.error.status === 404 && !response ? (
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
      {response ? (
        <div className="property-body">
          <p className="prov property-basis">
            <span className="tag tag--synthetic">
              {i18n.language === 'en' ? 'Synthetic data' : 'Dados sintéticos'}
            </span>
            <span>
              {t('asOf', {
                date: formatComputedAt(response.metadata.asOf, locale),
                version: response.metadata.fixtureVersion,
              })}
            </span>
          </p>
          <div className="property-pair property-pair--prices">
            <PropertyPrices response={response} />
            <PropertyHistory response={response} />
          </div>
          <div className="property-pair property-pair--evidence">
            <PropertyLifelines response={response} />
            <PropertyEvidence response={response} />
          </div>
          <div className="property-pair">
            <PropertyFeatures response={response} />
            <PropertyProvenance response={response} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
export function PropertyDetails() {
  const { propertyId } = useParams();
  const { t } = useTranslation('property');
  return isPropertyId(propertyId) ? (
    <ValidProperty key={propertyId} id={propertyId} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalid')}</h1>
      <p>{t('choose')}</p>
      <Link className="btn" to="/search">
        {t('back')}
      </Link>
    </main>
  );
}
