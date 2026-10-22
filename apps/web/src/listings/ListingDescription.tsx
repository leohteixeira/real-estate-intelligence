import type { ListingDetail } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';

export function ListingDescription({ listing }: { readonly listing: ListingDetail }) {
  const { t, i18n } = useTranslation('listing');
  const description = listing.description;
  const date = (value: string) => formatComputedAt(value, i18n.language as Locale);
  return (
    <section className="panel listing-description" aria-labelledby="listing-description-title">
      <div className="sec">
        <h2 id="listing-description-title">{t('description')}</h2>
      </div>
      <div className="property-panel-body">
        {description.permission === 'allowed' ? (
          <>
            <p className="listing-description-text">{description.current}</p>
            <p className="prov">
              <time dateTime={listing.fieldEffectiveAt.description}>
                {date(listing.fieldEffectiveAt.description)}
              </time>
            </p>
            <details className="listing-comparison">
              <summary>{t('compare')}</summary>
              <h3>{t('currentText')}</h3>
              <p className="listing-description-text">{description.current}</p>
              <h3>{t('versions')}</h3>
              <p className="small">{t('versionNote')}</p>
              <ol className="rows">
                {description.versions.map((version, index) => (
                  <li key={`${index}:${version.effectiveAt}:${version.contentHash}`}>
                    <time dateTime={version.effectiveAt}>{date(version.effectiveAt)}</time>
                    <p className="listing-description-text">{version.text}</p>
                    <p className="prov">{version.contentHash}</p>
                  </li>
                ))}
              </ol>
              {description.versions.length === 0 ? <p>{t('noVersions')}</p> : null}
            </details>
          </>
        ) : (
          <>
            <p className="note">{t('denied')}</p>
            <ul>
              {description.changedAt.map((instant, index) => (
                <li key={`${index}:${instant}`}>
                  <time dateTime={instant}>{date(instant)}</time>
                </li>
              ))}
            </ul>
            {description.changedAt.length === 0 ? <p>{t('noChanges')}</p> : null}
          </>
        )}
        <a href={description.sourceUrl} rel="noreferrer">
          {t('sourceUrl')}
        </a>
      </div>
    </section>
  );
}
