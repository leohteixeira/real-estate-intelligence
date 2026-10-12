import type { MarketEvidence } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { publicRequestId } from '../api/client';
import { formatComputedAt, formatCount, formatMedian } from '../places/formatters';
import type { Locale } from '../places/locale';

export type StateAction = { readonly label: string } & (
  | { readonly href: string; readonly onClick?: never }
  | { readonly onClick: () => void; readonly href?: never }
);
function RecoveryAction({
  action,
  variant = '',
}: {
  readonly action: StateAction;
  readonly variant?: string;
}) {
  const className = `btn btn--block ${variant}`;
  return action.href !== undefined ? (
    <a className={className} href={action.href}>
      {action.label}
    </a>
  ) : (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

export function LoadingState({
  label,
  layout = 'place',
}: {
  readonly label: string;
  readonly layout?: 'place' | 'figure';
}) {
  return (
    <div className={`system-state system-loading system-loading--${layout}`}>
      <p role="status">{label}</p>
      <div className="system-loading__skeleton" aria-hidden="true">
        {layout === 'figure' ? (
          <span className="sk system-loading__value" />
        ) : (
          <>
            <span className="sk" />
            <span className="sk system-loading__name" />
            <span className="sk" />
            <div className="system-loading__pair">
              <span className="sk" />
              <span className="sk" />
            </div>
            <span className="sk system-loading__body" />
            <span className="sk" />
            <span className="sk" />
            <span className="sk" />
            <span className="sk" />
          </>
        )}
      </div>
    </div>
  );
}

export interface NoResultsStateProps {
  readonly placeName: string;
  readonly filterCount: number;
  readonly responsibleFilter: string;
  readonly limitMinorUnits: number;
  readonly lastExcludedCount: number;
  readonly minimumMinorUnits: number;
  readonly relax: StateAction;
  readonly widen: StateAction;
  readonly alert?: StateAction;
}
export function NoResultsState({
  placeName,
  filterCount,
  responsibleFilter,
  limitMinorUnits,
  lastExcludedCount,
  minimumMinorUnits,
  relax,
  widen,
  alert,
}: NoResultsStateProps) {
  const { t, i18n } = useTranslation('shared');
  const locale = i18n.language as Locale;
  return (
    <div className="system-state system-empty">
      <div role="status">
        <h3>
          {t('noResults', {
            place: placeName,
            count: filterCount,
            formatted: formatCount(filterCount, locale),
          })}
        </h3>
        <p className="muted">
          {t('emptyReason', {
            filter: responsibleFilter,
            limit: formatMedian(limitMinorUnits, locale),
            excluded: formatCount(lastExcludedCount, locale),
            minimum: formatMedian(minimumMinorUnits, locale),
          })}
        </p>
      </div>
      <div className="system-state__actions">
        <RecoveryAction action={relax} variant="btn--primary" />
        <RecoveryAction action={widen} />
        {alert ? <RecoveryAction action={alert} variant="btn--quiet" /> : null}
      </div>
    </div>
  );
}

export interface LoadErrorStateProps {
  readonly description: string;
  readonly context?: string;
  readonly retry: () => void;
  readonly requestId?: string;
}
export function LoadErrorState({ description, context, retry, requestId }: LoadErrorStateProps) {
  const { t } = useTranslation('shared');
  const id = publicRequestId(requestId);
  return (
    <div className="system-state system-error">
      <div className="note note--danger" role="alert">
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4.5M12 17.4v.1" />
        </svg>
        <div>
          <strong>{description}</strong>
          {context ? <p>{context}</p> : null}
        </div>
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={retry}>
        {t('retry')}
      </button>
      {id ? <p className="prov system-error__reference">{t('supportReference', { id })}</p> : null}
    </div>
  );
}

export interface StaleFiguresNoticeProps {
  readonly freshness: {
    readonly status: MarketEvidence['freshness']['status'];
    readonly ageSeconds?: number | null;
  };
  readonly failure?: { readonly sourceName: string; readonly since: string };
  readonly collectionStatus?: {
    readonly authorized: true;
    readonly href: string;
    readonly label: string;
  };
}
function ageLabel(seconds: number, locale: Locale) {
  const [divisor, unit] =
    seconds >= 86400
      ? ([86400, 'day'] as const)
      : seconds >= 3600
        ? ([3600, 'hour'] as const)
        : seconds >= 60
          ? ([60, 'minute'] as const)
          : ([1, 'second'] as const);
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
    maximumFractionDigits: 0,
  }).format(Math.floor(seconds / divisor));
}
export function StaleFiguresNotice({
  freshness,
  failure,
  collectionStatus,
}: StaleFiguresNoticeProps) {
  const { t, i18n } = useTranslation('shared');
  if (freshness.status !== 'stale') return null;
  const locale = i18n.language as Locale;
  const age = freshness.ageSeconds;
  return (
    <div className="system-stale">
      <div className="note note--warn" role="status">
        <div>
          <strong>
            {typeof age === 'number' && Number.isFinite(age) && age >= 0
              ? t('staleAge', { age: ageLabel(age, locale) })
              : t('staleAgeUnavailable')}
          </strong>
          {failure ? (
            <p>
              {t('collectionFailure', {
                source: failure.sourceName,
                since: formatComputedAt(failure.since, locale),
              })}
            </p>
          ) : null}
          <p>{t('staleExplanation')}</p>
        </div>
      </div>
      {collectionStatus?.authorized ? (
        <a className="btn btn--quiet" href={collectionStatus.href}>
          {collectionStatus.label}
        </a>
      ) : null}
    </div>
  );
}
