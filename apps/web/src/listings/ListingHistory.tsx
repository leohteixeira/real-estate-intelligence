import type { ListingDetail } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import type { Locale } from '../places/locale';
import { ListingEvidence } from './ListingFacts';

export function ListingHistory({ listing }: { readonly listing: ListingDetail }) {
  const { t, i18n } = useTranslation('listing');
  const locale = i18n.language as Locale;
  return (
    <section className="panel listing-history" aria-labelledby="listing-events-title">
      <div className="sec">
        <h2 id="listing-events-title">{t('events')}</h2>
      </div>
      <div className="property-panel-body">
        <ol className="steps listing-events">
          {listing.history
            .toSorted((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt))
            .map((event, index) => (
              <li key={`${index}:${event.effectiveAt}:${event.type}`}>
                <div>
                  <h3>{t(event.type)}</h3>
                  <time dateTime={event.effectiveAt}>
                    {formatComputedAt(event.effectiveAt, locale)}
                  </time>
                  {event.type === 'created' ? <p className="small">{t('initialUnknown')}</p> : null}
                  {event.type === 'price-changed' ? (
                    <p className="small">
                      {t('previous')}: {formatExactMoney(event.previousMinorUnits, locale)} ·{' '}
                      {t('current')}: {formatExactMoney(event.currentMinorUnits, locale)}
                    </p>
                  ) : null}
                  {event.type === 'removed' ? <p className="small">{t('removal')}</p> : null}
                  {event.type === 'description-changed' ? (
                    <details>
                      <summary>{t('description')}</summary>
                      <dl className="kv">
                        <dt>{t('beforeHash')}</dt>
                        <dd>{event.beforeHash}</dd>
                        <dt>{t('afterHash')}</dt>
                        <dd>{event.afterHash}</dd>
                      </dl>
                    </details>
                  ) : null}
                  <details>
                    <summary>{t('eventEvidence')}</summary>
                    <ListingEvidence provenance={event.provenance} />
                  </details>
                </div>
              </li>
            ))}
        </ol>
        {listing.history.length === 0 ? <p>{t('noEvents')}</p> : null}
      </div>
    </section>
  );
}
