import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PROPERTY_TYPES, TIME_ON_MARKET_BANDS } from '@rei/contracts';
import type { PlaceDetail, SearchQuery } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { LoadErrorState } from '../shared/SystemStates';
import type { Locale } from '../places/locale';
import { draftQuery, rangeKeys, searchHref, toDraft } from './search-state';
import type { SearchDraft } from './search-state';
import { hierarchyQuery, searchQuery } from './search-queries';

const types = ['apartment', 'house', 'studio', 'commercial', 'land'] as const;
const historyFields = [
  { key: 'priceReduced', label: 'reduced' },
  { key: 'returnedToMarket', label: 'returned' },
  { key: 'multipleListings', label: 'multiple' },
] as const;
function placePath(place: PlaceDetail): string {
  return [
    place.name.ptBR,
    ...place.breadcrumbs
      .filter((crumb) => crumb.id !== place.id)
      .map((crumb) => crumb.name.ptBR)
      .reverse(),
  ].join(' / ');
}
export function SearchFilters({
  query,
  place,
}: {
  readonly query: SearchQuery;
  readonly place: PlaceDetail;
}) {
  const { t, i18n } = useTranslation('search');
  const { t: shared } = useTranslation('shared');
  const locale = i18n.language as Locale;
  const navigate = useNavigate();
  const [editing, setEditing] = useState(() => ({ draft: toDraft(query, locale), locale }));
  if (editing.locale !== locale) {
    const previous = draftQuery(editing.draft, editing.locale);
    setEditing({
      draft: previous.valid
        ? toDraft(previous.query, locale)
        : {
            ...editing.draft,
            ...Object.fromEntries(
              rangeKeys.map((key) => [
                key,
                editing.draft[key].replace(/[.,]/g, (separator) => (separator === '.' ? ',' : '.')),
              ]),
            ),
          },
      locale,
    });
  }
  const draft = editing.draft;
  const validated = draftQuery(draft, editing.locale);
  const hierarchy = useQuery(hierarchyQuery());
  const preview = useQuery({
    ...searchQuery(validated.valid ? validated.query : { placeId: place.id }),
    enabled: validated.valid,
  });
  const update = (key: keyof Omit<SearchDraft, 'base'>, value: string) =>
    setEditing((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  const available = validated.valid && preview.isSuccess && !preview.isFetching;
  const places = hierarchy.data?.items ?? [place];
  const selectedPlace = places.find((item) => item.id === draft.placeId);
  const ranges = [
    { label: 'asking', min: 'minAskingPrice', max: 'maxAskingPrice' },
    { label: 'perMeter', min: 'minPricePerSquareMeter', max: 'maxPricePerSquareMeter' },
    { label: 'area', min: 'minArea', max: 'maxArea' },
  ] as const;
  return (
    <section className="search-filters" aria-labelledby="filters-title">
      <header className="shell search-filters__head">
        <h2 id="filters-title">{t('filters')}</h2>
        <Link className="iconbtn" to={searchHref(query)} aria-label={t('close')}>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </header>
      <form
        className="sheet search-filters__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (available && validated.valid) navigate(searchHref(validated.query));
        }}
      >
        <div className="sheet__grab" aria-hidden="true" />
        <div className="field search-filters__place">
          <label htmlFor="filter-place">{t('place')}</label>
          <select
            id="filter-place"
            value={draft.placeId}
            onChange={(event) => update('placeId', event.target.value)}
          >
            {places.map((item) => (
              <option key={item.id} value={item.id}>
                {placePath(item)}
              </option>
            ))}
          </select>
          <p className="hint">
            {selectedPlace ? (
              <span className="search-filters__path">{placePath(selectedPlace)}</span>
            ) : null}
            {t('placeHint')}
          </p>
          {hierarchy.isError ? (
            <LoadErrorState
              description={t('failedHierarchy')}
              retry={() => {
                void hierarchy.refetch();
              }}
            />
          ) : null}
        </div>
        <fieldset className="field search-filters__types">
          <legend>{t('type')}</legend>
          <div className="wrap">
            {[
              ...types,
              ...PROPERTY_TYPES.filter(
                (type) => !types.some((item) => item === type) && draft.propertyType === type,
              ),
            ].map((type) => (
              <button
                key={type}
                type="button"
                className="chip"
                aria-pressed={draft.propertyType === type}
                onClick={() => update('propertyType', draft.propertyType === type ? '' : type)}
              >
                {shared(type)}
              </button>
            ))}
          </div>
        </fieldset>
        {ranges.map((range) => (
          <fieldset className="field search-filters__range" key={range.label}>
            <legend>{t(range.label)}</legend>
            <div className="pair">
              {[
                { key: range.min, label: 'minimum' },
                { key: range.max, label: 'maximum' },
              ].map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={field.key}>{t(field.label)}</label>
                  <input
                    id={field.key}
                    aria-label={`${t(range.label)} — ${t(field.label)}`}
                    aria-invalid={!validated.valid}
                    aria-describedby={!validated.valid ? 'draft-error' : undefined}
                    inputMode="decimal"
                    type="text"
                    placeholder={t('any')}
                    value={draft[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset className="field search-filters__rooms">
          <legend>{t('bedrooms')}</legend>
          <div className="seg">
            {[
              '',
              '1',
              '2',
              '3',
              '4',
              ...(!['', '1', '2', '3', '4'].includes(draft.minBedrooms) ? [draft.minBedrooms] : []),
            ].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={draft.minBedrooms === value}
                onClick={() => update('minBedrooms', value)}
              >
                {value === '' ? t('any') : `${value}+`}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="pair search-filters__rooms">
          {[
            { key: 'minBathrooms', label: 'bathrooms', max: 3 },
            { key: 'minParkingSpaces', label: 'parking', max: 2 },
          ].map((field) => {
            const key = field.key as 'minBathrooms' | 'minParkingSpaces';
            const values = Array.from({ length: field.max }, (_, index) => String(index + 1));
            if (draft[key] !== '' && !values.includes(draft[key])) values.push(draft[key]);
            return (
              <div className="field" key={key}>
                <label htmlFor={key}>{t(field.label)}</label>
                <select
                  id={key}
                  value={draft[key]}
                  onChange={(event) => update(key, event.target.value)}
                >
                  <option value="">{t('any')}</option>
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {value}+
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="field search-filters__time">
          <label htmlFor="filter-time">{t('time')}</label>
          <select
            id="filter-time"
            value={draft.timeOnMarket}
            onChange={(event) => update('timeOnMarket', event.target.value)}
          >
            <option value="">{t('any')}</option>
            {TIME_ON_MARKET_BANDS.map((band) => (
              <option key={band} value={band}>
                {t(band)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="field search-filters__history">
          <legend>{t('history')}</legend>
          <div className="wrap">
            {historyFields.map((field) =>
              query[field.key] === false ? (
                <div className="field" key={field.key}>
                  <label htmlFor={field.key}>{t(field.label)}</label>
                  <select
                    id={field.key}
                    value={draft[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  >
                    <option value="">{t('any')}</option>
                    <option value="true">{t('yes')}</option>
                    <option value="false">{t('no')}</option>
                  </select>
                </div>
              ) : (
                <button
                  key={field.key}
                  type="button"
                  className="chip"
                  aria-pressed={draft[field.key] === 'true'}
                  onClick={() => update(field.key, draft[field.key] === 'true' ? '' : 'true')}
                >
                  {t(field.label)}
                </button>
              ),
            )}
          </div>
        </fieldset>
        {!validated.valid ? (
          <p id="draft-error" className="search-validation" role="alert">
            {t('invalidDraft', {
              format: editing.locale === 'en' ? '600,000.50 / 82.5' : '600.000,50 / 82,5',
            })}
          </p>
        ) : null}
        {validated.valid && preview.isError ? (
          <LoadErrorState
            description={t('failedPreview')}
            retry={() => {
              void preview.refetch();
            }}
          />
        ) : null}
        <div className="search-filters__actions">
          <button
            className="btn btn--quiet"
            type="button"
            onClick={() =>
              setEditing({
                draft: toDraft(
                  {
                    placeId: draft.placeId,
                    ...(query.sort ? { sort: query.sort } : {}),
                    ...(query.pageSize ? { pageSize: query.pageSize } : {}),
                  },
                  locale,
                ),
                locale,
              })
            }
          >
            {t('clear')}
          </button>
          <button className="btn btn--primary" type="submit" disabled={!available}>
            {available
              ? t('show', { count: preview.data.totalItems })
              : validated.valid && preview.isFetching
                ? t('countLoading')
                : t('apply')}
          </button>
        </div>
      </form>
    </section>
  );
}
