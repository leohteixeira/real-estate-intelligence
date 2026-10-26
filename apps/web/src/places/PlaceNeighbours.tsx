import type { PlaceMarketNeighboursResponse, PlaceDetail } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { OverviewEvidence } from './OverviewFigure';
import { formatMedian, formatPercentage } from './formatters';
import type { Locale } from './locale';
import { destinationPath } from '../shell/public-routes';
import { OverviewReadState } from './OverviewReadState';

export function PlaceNeighbours({
  data,
  pending,
  error,
  retry,
}: {
  readonly data: PlaceMarketNeighboursResponse | undefined;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
}) {
  const { t, i18n } = useTranslation('place');
  const locale = i18n.language as Locale;
  const origin = data?.basis === 'event-fed-place-figures' ? 'live' : 'prepared';
  return (
    <section className="panel place-neighbours" aria-labelledby="neighbours-label">
      <div className="sec">
        <h2 id="neighbours-label">{t('neighbours')}</h2>
      </div>
      <OverviewReadState pending={pending} error={error} retry={retry} label={t('neighbours')} />
      {data ? (
        <>
          <p className="place-origin">{t(origin)}</p>
          {data.items.length === 0 ? (
            <p className="place-panel-copy">{t('noNeighbours')}</p>
          ) : (
            <ul>
              {data.items.map((item) => (
                <li key={item.place.id} className="place-neighbour">
                  <Link to={destinationPath('places', item.place.id)}>{item.place.name.ptBR}</Link>
                  <div className="place-neighbour__median">
                    <h3 className="fig__label" aria-label={t('median')}>
                      <span className="tag">{t('asking')}</span>
                    </h3>
                    <p className="num">
                      {item.median.state === 'available'
                        ? `${formatMedian(item.median.value.minorUnits, locale)} /m²`
                        : t('figureUnavailable')}
                    </p>
                    <OverviewEvidence
                      evidence={item.median}
                      origin={origin}
                      compactLabel={t('medianEvidence')}
                    />
                  </div>
                  <div className="place-neighbour__movement">
                    <h3 className="fig__label" aria-label={t('movement')}>
                      {t('movementPeriod')}
                    </h3>
                    <p
                      className={
                        item.movement.value !== null && item.movement.value > 0 ? 'up' : 'down'
                      }
                    >
                      {item.movement.state === 'available'
                        ? formatPercentage(item.movement.value / 100, locale)
                        : t('figureUnavailable')}
                    </p>
                    <OverviewEvidence
                      evidence={item.movement}
                      origin={origin}
                      compactLabel={t('movementEvidence')}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
export function PlaceSchematic({
  place,
  neighbours,
}: {
  readonly place: PlaceDetail;
  readonly neighbours: PlaceMarketNeighboursResponse | undefined;
}) {
  const { t } = useTranslation('place');
  const names = neighbours?.items.map((item) => item.place.name.ptBR) ?? [];
  return (
    <section className="panel place-schematic" aria-labelledby="map-label">
      <div className="sec">
        <h2 id="map-label">{t('map')}</h2>
      </div>
      <div className="map place-map">
        <svg
          viewBox="0 0 358 190"
          role="img"
          aria-label={t('schematic', {
            name: place.name.ptBR,
            neighbours: names.length ? ` · ${names.join(' · ')}` : '',
          })}
        >
          <rect x="0" y="0" width="358" height="190" className="place-map__ground" />
          <path d="M179 48V142M80 95H278" className="place-map__connector" />
          <rect x="151" y="67" width="56" height="56" rx="6" className="place-map__identity" />
          <rect x="174" y="90" width="10" height="10" rx="2" className="place-map__here" />
          {names.map((name, index) => (
            <circle
              key={name}
              cx={60 + (index % 4) * 79}
              cy={index % 2 === 0 ? 30 : 160}
              r="8"
              className="place-map__identity"
            />
          ))}
        </svg>
        <p className="place-map__label">{place.name.ptBR}</p>
      </div>
      <p className="place-panel-copy">{t('schematicNote')}</p>
      {names.length ? <p className="place-panel-copy">{names.join(' · ')}</p> : null}
    </section>
  );
}
