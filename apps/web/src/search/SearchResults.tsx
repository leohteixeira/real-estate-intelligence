import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { PROPERTY_SORTS } from '@rei/contracts';
import type { PlaceDetail, SearchQuery } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiReadError } from '../api/client';
import { isPlaceId } from '../places/place-client';
import { placeQuery } from '../places/place-queries';
import { PlacePlate } from '../places/PlacePlate';
import { formatComputedAt, formatExactMoney, formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { PropertyRow } from '../shared/PropertyRow';
import { FilterNoResultsState, LoadErrorState, LoadingState } from '../shared/SystemStates';
import { activeGroups, parseSearchState, removeGroup, searchHref } from './search-state';
import type { FilterGroupId } from './search-state';
import { diagnosticQuery, resultsQuery, searchQuery } from './search-queries';
import { SearchFilters } from './SearchFilters';
import { SearchMedian } from './SearchMedian';

function SearchEmpty({
  query,
  place,
}: {
  readonly query: SearchQuery;
  readonly place: PlaceDetail;
}) {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const diagnosis = useQuery(diagnosticQuery(query));
  const parent = [...place.breadcrumbs].reverse().find((crumb) => crumb.id === place.parentId);
  const reason = diagnosis.data?.kind === 'filter' ? diagnosis.data : undefined;
  return (
    <div className="search-empty">
      {diagnosis.isPending ? <LoadingState label={t('countLoading')} layout="figure" /> : null}
      {diagnosis.isError ? (
        <LoadErrorState
          description={t('failedDiagnostic')}
          retry={() => {
            void diagnosis.refetch();
          }}
        />
      ) : null}
      <FilterNoResultsState
        title={t('empty')}
        {...(reason
          ? {
              reason: {
                filter: t(reason.group),
                excludedCount: reason.excluded,
                description: t('emptyReason', { filter: t(reason.group), count: reason.excluded }),
              },
              relax: {
                label: t('relax', { filter: t(reason.group) }),
                onClick: () => navigate(searchHref(removeGroup(query, reason.group))),
              },
            }
          : {})}
        {...(parent
          ? {
              widen: {
                label: t('widen', { name: parent.name.ptBR }),
                onClick: () => navigate(searchHref({ ...query, placeId: parent.id })),
              },
            }
          : {})}
      />
    </div>
  );
}
function SearchList({
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
  const results = useInfiniteQuery(resultsQuery(query));
  const total = useQuery(searchQuery({ placeId: place.id }));
  const neighborhood =
    place.kind === 'neighborhood'
      ? place
      : place.breadcrumbs.find((crumb) => crumb.kind === 'neighborhood');
  const comparison = useQuery({
    ...searchQuery({ placeId: neighborhood?.id ?? place.id }),
    enabled: neighborhood !== undefined,
  });
  const result = results.data?.pages[0];
  const rows = results.data?.pages.flatMap((page) => page.items) ?? [];
  function groupLabel(id: FilterGroupId): string {
    const group = activeGroups(query).find((item) => item.id === id)!;
    const values = group.keys.map((key) => {
      const value = query[key];
      if (value === undefined) return t('any');
      if (typeof value === 'boolean') return t(value ? 'yes' : 'no');
      if (key === 'propertyType') return shared(String(value));
      if (key === 'timeOnMarket') return t(String(value));
      if (typeof value === 'number')
        return key.includes('Price') || key.includes('Meter')
          ? formatExactMoney(value, locale)
          : `${formatQuantity(value, locale)}${key.includes('Area') ? ' m²' : '+'}`;
      return String(value);
    });
    return `${t(id)}: ${values.join(' – ')}`;
  }
  return (
    <div className="search-body">
      <div className="search-toolbar">
        <div>
          <h2 className="sr">{t('title')}</h2>
          <p>{t('applied', { count: activeGroups(query).length })}</p>
          {result && total.isSuccess && !total.isFetching ? (
            <p className="small search-count">
              {t('count', { count: result.totalItems, total: total.data.totalItems })}
            </p>
          ) : null}
        </div>
        <Link className="btn" to={searchHref(query, true)}>
          {t('filters')}
        </Link>
      </div>
      <div className="search-chips" role="group" aria-label={t('appliedGroup')}>
        {activeGroups(query).map((group) => (
          <button
            className="chip"
            type="button"
            key={group.id}
            aria-label={t('remove', { label: groupLabel(group.id) })}
            onClick={() => navigate(searchHref(removeGroup(query, group.id)))}
          >
            {groupLabel(group.id)}
            <svg className="i i--s" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        ))}
      </div>
      <div className="search-sort field">
        <label htmlFor="search-sort">{t('sort')}</label>
        <select
          id="search-sort"
          value={query.sort ?? 'furthest-below-median'}
          onChange={(event) =>
            navigate(searchHref({ ...query, sort: event.target.value as SearchQuery['sort'] }))
          }
        >
          {PROPERTY_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(sort)}
            </option>
          ))}
        </select>
      </div>
      {total.isError ? (
        <LoadErrorState
          description={t('failedTotal')}
          retry={() => {
            void total.refetch();
          }}
        />
      ) : null}
      {results.isPending ? <LoadingState label={t('loading')} /> : null}
      {results.isError && !results.isFetchNextPageError ? (
        <LoadErrorState
          description={t('failed')}
          retry={() => {
            void results.refetch();
          }}
          {...(results.error instanceof ApiReadError && results.error.requestId
            ? { requestId: results.error.requestId }
            : {})}
        />
      ) : null}
      {result && (!results.isError || results.isFetchNextPageError) ? (
        <>
          <SearchMedian
            result={result}
            {...(neighborhood && comparison.isSuccess
              ? { comparison: { name: neighborhood.name.ptBR, result: comparison.data } }
              : {})}
          />
          {comparison.isError && neighborhood ? (
            <LoadErrorState
              description={t('failedComparison')}
              retry={() => {
                void comparison.refetch();
              }}
            />
          ) : null}
          {result.totalItems === 0 ? (
            <SearchEmpty query={query} place={place} />
          ) : (
            <ul className="rows search-rows" aria-label={t('properties')}>
              {rows.map((property) => (
                <li key={property.id}>
                  <PropertyRow property={property} />
                </li>
              ))}
            </ul>
          )}
          {results.isFetchNextPageError ? (
            <div className="search-next-error">
              <LoadErrorState
                description={t('failedNext')}
                retry={() => {
                  void results.fetchNextPage();
                }}
              />
            </div>
          ) : results.hasNextPage ? (
            <div className="search-more">
              <button
                className="btn btn--block"
                type="button"
                disabled={results.isFetchingNextPage}
                onClick={() => {
                  void results.fetchNextPage();
                }}
              >
                {t(results.isFetchingNextPage ? 'loadingMore' : 'more')}
              </button>
            </div>
          ) : null}
          <p className="search-note prov">{t('rowNote')}</p>
          {rows.length > 0 ? (
            <details className="search-evidence search-row-evidence">
              <summary>{t('rowEvidence')}</summary>
              <ul>
                {rows.map((property) => (
                  <li key={property.id}>
                    {property.place.name.ptBR} ·{' '}
                    {property.askingPrice
                      ? t('sourceDate', {
                          source: property.askingPrice.provenance.sourceId,
                          time: formatComputedAt(
                            property.askingPrice.provenance.observedAt,
                            locale,
                          ),
                        })
                      : shared('askingUnavailable')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function ValidSearch({
  query,
  filters,
}: {
  readonly query: SearchQuery;
  readonly filters: boolean;
}) {
  const { t } = useTranslation('place');
  const place = useQuery(placeQuery(query.placeId!));
  const location = useLocation();
  return (
    <main id="search-results">
      {place.data ? <PlacePlate place={place.data.place} destination="search" /> : null}
      {place.isPending ? (
        <LoadingState label={t('loadingPlace')} />
      ) : place.isError ? (
        <div className="place-state">
          <LoadErrorState
            description={t('failedPlace')}
            retry={() => {
              void place.refetch();
            }}
          />
        </div>
      ) : place.data ? (
        filters ? (
          <SearchFilters
            key={`${location.key}:${query.placeId}`}
            query={query}
            place={place.data.place}
          />
        ) : (
          <SearchList query={query} place={place.data.place} />
        )
      ) : null}
    </main>
  );
}
export function SearchResults() {
  const { placeId } = useParams();
  const location = useLocation();
  const { t } = useTranslation('search');
  const { t: placeText } = useTranslation('place');
  if (!isPlaceId(placeId))
    return (
      <main className="place-state" role="alert">
        <h1>{placeText('invalidPlace')}</h1>
        <p>{placeText('choosePlace')}</p>
      </main>
    );
  const state = parseSearchState(placeId, location.search);
  return state.valid ? (
    <ValidSearch query={state.query} filters={state.filters} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalid')}</h1>
      <p>{t('invalidHint')}</p>
      <Link className="btn" to={searchHref({ placeId })}>
        {t('clearFilters')}
      </Link>
    </main>
  );
}
