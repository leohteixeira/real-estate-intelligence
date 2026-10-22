import { Fragment } from 'react';
import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import type { Locale } from '../places/locale';
import { removedIntervals, timeAxis } from './property-presentation';
import { PropertySourceLink } from './PropertySourceLink';

export function PropertyLifelines({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const locale = i18n.language as Locale;
  const axis = timeAxis(response);
  const listings = response.property.listings;
  return (
    <section className="panel property-lifelines" aria-labelledby="property-lifelines-title">
      <div className="sec">
        <h2 id="property-lifelines-title">{t('lifelines', { count: listings.length })}</h2>
        <a href="#property-evidence">{t('evidenceLink')}</a>
      </div>
      <div className="property-panel-body">
        <div className="life">
          {listings.map((listing) => {
            const gaps = removedIntervals(listing, axis.through);
            const narration = [
              ...listing.lifeline.map((interval) =>
                t('interval', {
                  from: formatComputedAt(interval.from, locale),
                  to: interval.to
                    ? `– ${formatComputedAt(interval.to, locale)}`
                    : t('through', { date: formatComputedAt(axis.through, locale) }),
                }),
              ),
              ...gaps.map((gap) =>
                t('gap', {
                  from: formatComputedAt(gap.from, locale),
                  to: formatComputedAt(gap.to, locale),
                }),
              ),
            ].join('. ');
            return (
              <Fragment key={listing.id}>
                <PropertySourceLink listingId={listing.id}>
                  {listing.source.label}
                </PropertySourceLink>
                <div
                  className="life__track"
                  role="img"
                  aria-label={`${listing.source.label}: ${narration}`}
                >
                  {listing.lifeline.map((interval) => (
                    <i
                      key={interval.from}
                      className="life__bar"
                      style={{
                        left: `${axis.position(interval.from)}%`,
                        width: `${Math.max(0, axis.position(interval.to ?? axis.through) - axis.position(interval.from))}%`,
                      }}
                    />
                  ))}
                  {gaps.map((gap) => (
                    <i
                      key={gap.from}
                      className="life__bar life__bar--off"
                      style={{
                        left: `${axis.position(gap.from)}%`,
                        width: `${Math.max(0, axis.position(gap.to) - axis.position(gap.from))}%`,
                      }}
                    />
                  ))}
                  {listing.history
                    .filter((event) => event.type === 'price-changed')
                    .map((event) => (
                      <i
                        key={event.effectiveAt}
                        className="life__tick"
                        style={{ left: `${axis.position(event.effectiveAt)}%` }}
                      />
                    ))}
                </div>
              </Fragment>
            );
          })}
          <span />
          <div className="life__axis">
            {axis.months
              .filter((_, index) =>
                [
                  0,
                  Math.floor((axis.months.length - 1) / 4),
                  Math.floor((axis.months.length - 1) / 2),
                  Math.floor(((axis.months.length - 1) * 3) / 4),
                  axis.months.length - 1,
                ].includes(index),
              )
              .map((month) => (
                <span
                  key={month}
                  data-month={month}
                  className={
                    [
                      axis.months[0],
                      axis.months[Math.floor((axis.months.length - 1) / 2)],
                      axis.months.at(-1),
                    ].includes(month)
                      ? ''
                      : 'life__axis-secondary'
                  }
                  style={{ left: `${axis.position(month)}%` }}
                >
                  {new Intl.DateTimeFormat(locale, {
                    month: 'short',
                    year: '2-digit',
                    timeZone: 'UTC',
                  }).format(new Date(month))}
                </span>
              ))}
          </div>
        </div>
        <p className="prov">
          {t('legend')} {t('removalNote')}
        </p>
        <details>
          <summary>{t('chronology')}</summary>
          <p className="small">
            {t('months')}:{' '}
            {axis.months
              .map((month) =>
                new Intl.DateTimeFormat(locale, {
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(month)),
              )
              .join(' · ')}
          </p>
          {listings.map((listing) => (
            <div className="property-listing-history" key={listing.id}>
              <h3>{listing.source.label}</h3>
              <ol className="rows">
                {listing.history.map((event, index) => (
                  <li key={`${event.effectiveAt}:${event.type}:${index}`}>
                    <strong>{t(event.type)}</strong> ·{' '}
                    <time dateTime={event.effectiveAt}>
                      {formatComputedAt(event.effectiveAt, locale)}
                    </time>
                    {event.type === 'price-changed' ? (
                      <p>
                        {formatExactMoney(event.previousMinorUnits, locale)} →{' '}
                        {formatExactMoney(event.currentMinorUnits, locale)}{' '}
                        <span className="tag">{t('asking')}</span>
                      </p>
                    ) : null}
                    {event.type === 'description-changed' ? (
                      <p className="prov">
                        {event.beforeHash} → {event.afterHash}
                      </p>
                    ) : null}
                    <p className="prov">
                      {t('observed', {
                        date: formatComputedAt(event.provenance.observedAt, locale),
                      })}{' '}
                      · {event.provenance.contentHash}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </details>
      </div>
    </section>
  );
}
