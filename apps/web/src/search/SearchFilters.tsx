import { useEffect, useState } from 'react';
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
import { placeName } from '../places/locale';

/** A count is requested only after the draft rests: each keystroke used to cost one slow read. */
const COUNT_DEBOUNCE_MS = 400;
const types = ['apartment', 'house', 'studio', 'commercial', 'land'] as const;
const historyFields = [
  { key: 'priceReduced', label: 'reduced' },
  { key: 'returnedToMarket', label: 'returned' },
  { key: 'multipleListings', label: 'multiple' },
] as const;
function placePath(place: PlaceDetail, language: string): string {
  return [
    placeName(place.name, language),
    ...place.breadcrumbs
      .filter((crumb) => crumb.id !== place.id)
      .map((crumb) => placeName(crumb.name, language))
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
  const draftKey = validated.valid ? JSON.stringify(validated.query) : null;
  const [restedKey, setRestedKey] = useState(draftKey);
  useEffect(() => {
    const timer = setTimeout(() => setRestedKey(draftKey), COUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftKey]);
  // While the draft is still changing no count is observed, which also aborts a superseded read.
  const rested = validated.valid && restedKey === draftKey;
  const preview = useQuery({
    ...searchQuery(rested ? validated.query : { placeId: place.id }),
    enabled: rested,
  });
  const update = (key: keyof Omit<SearchDraft, 'base'>, value: string) =>
    setEditing((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  const counting = validated.valid && (!rested || preview.isFetching);
  const counted = rested && preview.isSuccess && !preview.isFetching;
  // The count is a preview: when it fails, the valid draft can still be applied.
  const applicable = validated.valid && !counting;
  const places = hierarchy.data?.items ?? [place];
  const selectedPlace = places.find((item) => item.id === draft.placeId);
  const ranges = [
    { label: 'asking', min: 'minAskingPrice', max: 'maxAskingPrice' },
    { label: 'perMeter', min: 'minPricePerSquareMeter', max: 'maxPricePerSquareMeter' },
    { label: 'area', min: 'minArea', max: 'maxArea' },
  ] as const;
  // A field that is not a number is reported on that field; only two sound numbers can be reversed.
  const invalidFields: readonly string[] = validated.valid ? [] : validated.fields;
  const invalidRanges = new Set(
    ranges
      .filter(
        (range) =>
          !invalidFields.includes(range.min) &&
          !invalidFields.includes(range.max) &&
          !draftQuery(
            {
              ...toDraft({ placeId: draft.placeId }, editing.locale),
              [range.min]: draft[range.min],
              [range.max]: draft[range.max],
            },
            editing.locale,
          ).valid,
      )
      .map((range) => range.label),
  );
  const close = searchHref(query);
  useEffect(() => {
    // Escape leaves the editor exactly as the close link does. A select keeps its own Escape,
    // which dismisses its open list.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target instanceof HTMLSelectElement) return;
      void navigate(close);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, close]);
  return (
    <section className="search-filters" aria-labelledby="filters-title">
      <header className="shell search-filters__head">
        <h2 id="filters-title" tabIndex={-1}>
          {t('filters')}
        </h2>
        <Link className="iconbtn" to={close} aria-label={t('close')}>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </header>
      <form
        className="sheet search-filters__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (applicable && validated.valid) navigate(searchHref(validated.query));
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
                {placePath(item, i18n.language)}
              </option>
            ))}
          </select>
          <p className="hint">
            {selectedPlace ? (
              <span className="search-filters__path">
                {placePath(selectedPlace, i18n.language)}
              </span>
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
              ].map((field) => {
                const notNumber = invalidFields.includes(field.key);
                const reversed = invalidRanges.has(range.label);
                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={field.key}>{t(field.label)}</label>
                    <input
                      id={field.key}
                      aria-label={`${t(range.label)} — ${t(field.label)}`}
                      aria-invalid={notNumber || reversed}
                      aria-describedby={
                        notNumber ? `${field.key}-error` : reversed ? 'draft-error' : undefined
                      }
                      inputMode="decimal"
                      type="text"
                      placeholder={t('any')}
                      value={draft[field.key]}
                      onChange={(event) => update(field.key, event.target.value)}
                    />
                    {notNumber ? (
                      <p id={`${field.key}-error`} className="search-validation" role="alert">
                        {t('invalidNumber', {
                          format:
                            range.label === 'area'
                              ? editing.locale === 'en'
                                ? '82.5'
                                : '82,5'
                              : editing.locale === 'en'
                                ? '600,000.50'
                                : '600.000,50',
                        })}
                      </p>
                    ) : null}
                  </div>
                );
              })}
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
        {invalidRanges.size > 0 ? (
          <p id="draft-error" className="search-validation" role="alert">
            {t('invalidDraft')}
          </p>
        ) : null}
        {rested && preview.isError && !preview.isFetching ? (
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
          <button className="btn btn--primary" type="submit" disabled={!applicable}>
            {counted
              ? t('show', { count: preview.data.totalItems })
              : counting
                ? t('countLoading')
                : t('apply')}
          </button>
        </div>
      </form>
    </section>
  );
}
