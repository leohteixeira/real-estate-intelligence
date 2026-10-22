import { useEffect } from 'react';
import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';
import { evidenceAnchor, revealEvidenceTarget } from './property-presentation';
import { listingHref, validSearchReturn } from './property-navigation';

export function PropertyProvenance({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const locale = i18n.language as Locale;
  const date = (instant: string) => formatComputedAt(instant, locale);
  const returns = new URLSearchParams(useLocation().search).getAll('returnTo');
  const returnTo = returns.length === 1 ? validSearchReturn(returns[0]!) : null;
  useEffect(() => {
    const reveal = () => revealEvidenceTarget(window.location.hash.slice(1));
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  return (
    <section className="panel property-provenance" aria-labelledby="property-provenance-title">
      <div className="sec">
        <h2 id="property-provenance-title">{t('provenance')}</h2>
      </div>
      <div className="property-panel-body">
        <dl className="kv">
          <dt>{t('firstCollection')}</dt>
          <dd>{date(response.property.summary.firstCollectedAt)}</dd>
          <dt>{t('lastCollection')}</dt>
          <dd>{date(response.property.summary.lastCollectedAt)}</dd>
        </dl>
        {response.property.listings.map((listing) => (
          <details className="property-source-disclosure" key={listing.id}>
            <summary>
              <strong>{listing.source.label}</strong>
              <span className="small">
                {t(listing.status === 'active' ? 'active' : 'removed', { count: 1 })} ·{' '}
                {t(listing.snapshot.availability)} · {listing.collectionCount} {t('collections')}
              </span>
            </summary>
            <article
              className="property-source"
              key={listing.id}
              id={evidenceAnchor(listing.id)}
              tabIndex={-1}
            >
              <h3>{listing.source.label}</h3>
              <Link className="btn" to={listingHref(listing.id, returnTo)}>
                {i18n.language === 'en'
                  ? `Inspect listing at ${listing.source.label}`
                  : `Inspecionar anúncio na ${listing.source.label}`}
              </Link>
              <p className="small">
                {t(listing.status === 'active' ? 'active' : 'removed', { count: 1 })} ·{' '}
                {listing.publishedNeighborhood}
              </p>
              <dl className="kv">
                <dt>{t('firstCollection')}</dt>
                <dd>{date(listing.firstCollectedAt)}</dd>
                <dt>{t('lastCollection')}</dt>
                <dd>{date(listing.lastCollectedAt)}</dd>
                <dt>{t('collections')}</dt>
                <dd>{listing.collectionCount}</dd>
                <dt>{t('snapshot')}</dt>
                <dd>
                  {t(listing.snapshot.availability)} · {date(listing.snapshot.collectedAt)}
                </dd>
              </dl>
              <details>
                <summary>{t('metadata')}</summary>
                <dl className="kv">
                  <dt>{t('listingId')}</dt>
                  <dd>{listing.id}</dd>
                  <dt>{t('sourceListingId')}</dt>
                  <dd>{listing.source.sourceListingId}</dd>
                  <dt>{t('runId')}</dt>
                  <dd>{listing.provenance.runId}</dd>
                  <dt>{t('snapshotId')}</dt>
                  <dd>{listing.provenance.snapshotId}</dd>
                  <dt>{t('contentHash')}</dt>
                  <dd>{listing.provenance.contentHash}</dd>
                  <dt>{t('observed', { date: '' })}</dt>
                  <dd>{date(listing.provenance.observedAt)}</dd>
                  <dt>{t('expires')}</dt>
                  <dd>
                    {listing.snapshot.expiresAt ? date(listing.snapshot.expiresAt) : t('unknown')}
                  </dd>
                  <dt>{t('currentAsking')}</dt>
                  <dd>{date(listing.fieldEffectiveAt.askingPrice)}</dd>
                  <dt>{t('description')}</dt>
                  <dd>{date(listing.fieldEffectiveAt.description)}</dd>
                  <dt>{t('attributes')}</dt>
                  <dd>{date(listing.fieldEffectiveAt.attributes)}</dd>
                </dl>
              </details>
              <details>
                <summary>
                  {listing.description.permission === 'allowed'
                    ? t('description')
                    : t('changedDates')}
                </summary>
                {listing.description.permission === 'allowed' ? (
                  <>
                    <p>{listing.description.current}</p>
                    <h4>{t('versions')}</h4>
                    <ol className="rows">
                      {listing.description.versions.map((version) => (
                        <li key={`${version.effectiveAt}:${version.contentHash}`}>
                          <time dateTime={version.effectiveAt}>{date(version.effectiveAt)}</time>
                          <p>{version.text}</p>
                          <p className="prov">{version.contentHash}</p>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <>
                    <p>{t('denied')}</p>
                    <ul>
                      {listing.description.changedAt.map((instant) => (
                        <li key={instant}>{date(instant)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            </article>
          </details>
        ))}
      </div>
    </section>
  );
}
