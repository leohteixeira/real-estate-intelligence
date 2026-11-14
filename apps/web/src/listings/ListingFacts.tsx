import type { ListingDetail, ListingProvenance } from '@rei/contracts';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney, formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { evidenceLabel, sourceName } from '../shared/api-labels';

export function ListingEvidence({ provenance }: { readonly provenance: ListingProvenance }) {
  const { t, i18n } = useTranslation('listing');
  return (
    <dl className="kv listing-identifiers">
      <dt>{t('sourceId')}</dt>
      <dd>{provenance.sourceId}</dd>
      <dt>{t('sourceListingId')}</dt>
      <dd>{provenance.sourceListingId}</dd>
      <dt>{t('run')}</dt>
      <dd>{provenance.runId}</dd>
      <dt>{t('snapshotId')}</dt>
      <dd>{provenance.snapshotId}</dd>
      <dt>{t('hash')}</dt>
      <dd>{provenance.contentHash}</dd>
      <dt>{t('observed')}</dt>
      <dd>{formatComputedAt(provenance.observedAt, i18n.language as Locale)}</dd>
      <dt>{t('source')}</dt>
      <dd>
        <a href={provenance.sourceUrl} rel="noreferrer">
          {t('sourceUrl')}
        </a>
      </dd>
    </dl>
  );
}

export function ListingFacts({ listing }: { readonly listing: ListingDetail }) {
  const { t, i18n } = useTranslation('listing');
  const date = (value: string) => formatComputedAt(value, i18n.language as Locale);
  return (
    <section className="panel listing-provenance" aria-labelledby="listing-provenance-title">
      <div className="sec">
        <h2 id="listing-provenance-title">{t('provenance')}</h2>
      </div>
      <div className="property-panel-body">
        <dl className="kv">
          <dt>{t('source')}</dt>
          <dd>{sourceName(listing.source, i18n)}</dd>
          <dt>{t('sourceUrlLabel')}</dt>
          <dd>
            <a href={listing.source.url} rel="noreferrer">
              {t('sourceUrl')}
            </a>
          </dd>
          <dt>{t('first')}</dt>
          <dd>{date(listing.firstCollectedAt)}</dd>
          <dt>{t('last')}</dt>
          <dd>{date(listing.lastCollectedAt)}</dd>
          <dt>{t('run')}</dt>
          <dd>{listing.provenance.runId}</dd>
          <dt>{t('snapshot')}</dt>
          <dd>{t(listing.snapshot.availability)}</dd>
          <dt>{t('collected')}</dt>
          <dd>{date(listing.snapshot.collectedAt)}</dd>
          <dt>{t('expires')}</dt>
          <dd>{listing.snapshot.expiresAt ? date(listing.snapshot.expiresAt) : t('unknown')}</dd>
          <dt>{t('collections')}</dt>
          <dd>{formatQuantity(listing.collectionCount, i18n.language as Locale)}</dd>
          <dt>{t('retained')}</dt>
          <dd>{t('unknown')}</dd>
        </dl>
        <p className="prov">{t('retention')}</p>
        <details>
          <summary>{t('metadata')}</summary>
          <dl className="kv listing-publication-identifiers">
            <dt>{t('listingId')}</dt>
            <dd>{listing.id}</dd>
            <dt>{t('fixtureLabel')}</dt>
            <dd>{evidenceLabel(listing.fixtureLabel, i18n.language)}</dd>
          </dl>
          <p className="prov">{t('fixtureCaveat')}</p>
          <ListingEvidence provenance={listing.provenance} />
        </details>
      </div>
    </section>
  );
}

export function ListingValues({ listing }: { readonly listing: ListingDetail }) {
  const { t, i18n } = useTranslation('listing');
  const { t: shared } = useTranslation('shared');
  const { t: propertyText } = useTranslation('property');
  const locale = i18n.language as Locale;
  const rows = [
    {
      field: 'askingField',
      value: formatExactMoney(listing.askingPriceMinorUnits, locale),
      since: listing.fieldEffectiveAt.askingPrice,
    },
    {
      field: 'propertyType',
      value: shared(listing.propertyType),
      since: listing.fieldEffectiveAt.attributes,
    },
    {
      field: 'neighborhoodField',
      value: listing.publishedNeighborhood,
      since: listing.fieldEffectiveAt.attributes,
    },
    ...(['areaSquareMeters', 'bedrooms', 'bathrooms', 'parkingSpaces'] as const).map((field) => ({
      field,
      value:
        listing[field] === null
          ? t('unknown')
          : `${formatQuantity(listing[field], locale)}${field === 'areaSquareMeters' ? ' m²' : ''}`,
      since: listing.fieldEffectiveAt.attributes,
    })),
    {
      field: 'description',
      value: t('description'),
      since: listing.fieldEffectiveAt.description,
    },
  ];
  return (
    <section className="panel listing-values" aria-labelledby="listing-values-title">
      <div className="sec">
        <h2 id="listing-values-title">{t('values')}</h2>
      </div>
      <div className="property-panel-body">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{t('field')}</th>
                <th scope="col">{t('value')}</th>
                <th scope="col">{t('since')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field}>
                  <th scope="row">{t(row.field)}</th>
                  <td>{row.value}</td>
                  <td>
                    <time dateTime={row.since} title={formatComputedAt(row.since, locale)}>
                      {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
                        dateStyle: locale === 'en' ? 'medium' : 'short',
                        timeZone: 'UTC',
                      }).format(new Date(row.since))}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="listing-effective-times">
          <summary>{t('completeTimes')}</summary>
          <dl className="kv">
            {rows.map((row) => (
              <Fragment key={row.field}>
                <dt>{t(row.field)}</dt>
                <dd>
                  <time dateTime={row.since}>{formatComputedAt(row.since, locale)}</time>
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>
        <h3>{t('features')}</h3>
        {listing.features.length ? (
          <ul className="listing-features">
            {listing.features.map((feature) => (
              <li key={feature}>
                <span className="tag">{propertyText(feature, { defaultValue: feature })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">{t('noFeatures')}</p>
        )}
      </div>
    </section>
  );
}
