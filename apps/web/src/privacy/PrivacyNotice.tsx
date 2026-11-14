import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { EnabledSourceDto } from '@rei/contracts';
import { ApiReadError } from '../api/client';
import { config } from '../config';
import { LoadErrorState } from '../shared/SystemStates';
import { privacySourcesQuery } from './privacy-client';

const sections = [
  ['fields', 'fieldsTitle'],
  ['sources', 'sourcesTitle'],
  ['purpose', 'purposeTitle'],
  ['basis', 'basisTitle'],
  ['retention', 'retentionTitle'],
  ['sharing', 'sharingTitle'],
  ['rights', 'rightsTitle'],
  ['removal', 'removalTitle'],
  ['controller', 'controllerTitle'],
] as const;

function Source({ source }: { readonly source: EnabledSourceDto }) {
  const { t, i18n } = useTranslation('privacy');
  // Repository-owned synthetic sources are known codes with bundled names; any other source keeps
  // the attribution and licence text published by the API.
  const nameKey = `sourceName-${source.sourceId}`;
  const bundled = i18n.exists(nameKey, { ns: 'privacy' });
  return (
    <li className="privacy-source">
      <h3>{bundled ? t(nameKey) : source.displayLabel}</h3>
      <p className="small">
        {t('sourceEnabled')} · {source.sourceId}
      </p>
      <p>
        {source.licence.status === 'licensed' ? (
          <>
            {t('licenceLicensed')} <a href={source.licence.url}>{source.licence.label}</a>
          </>
        ) : source.licence.status === 'not-applicable' ? (
          bundled ? (
            t('licenceSynthetic')
          ) : (
            <>
              {t('licenceNotApplicable')} {source.licence.label}
            </>
          )
        ) : (
          t('licenceUnverified')
        )}
      </p>
      <dl className="privacy-permissions">
        {(
          [
            ['collectionPermission', source.permissions.collectionAllowed],
            ['imagePermission', source.permissions.imageFetchingAllowed],
            ['textPermission', source.permissions.listingTextDisplayAllowed],
          ] as const
        ).map(([label, allowed]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{t(allowed ? 'allowed' : 'denied')}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function PrivacyNotice() {
  const { t } = useTranslation('privacy');
  const sources = useQuery(privacySourcesQuery());
  return (
    <main className="privacy-document" id="privacy-content">
      <article aria-labelledby="privacy-title">
        <header className="privacy-opening">
          <h1 id="privacy-title">{t('title')}</h1>
          <p>{t('introduction')}</p>
          <p>{t('scope')}</p>
        </header>
        <nav className="privacy-contents" aria-label={t('contents')}>
          <ul>
            {sections.map(([id, title]) => (
              <li key={id}>
                <a href={`#${id}`}>{t(title)}</a>
              </li>
            ))}
          </ul>
        </nav>
        {sections.map(([id, title]) => (
          <section key={id} id={id} aria-labelledby={`privacy-${id}`}>
            <h2 id={`privacy-${id}`} tabIndex={-1}>
              {t(title)}
            </h2>
            {id === 'fields' ? (
              <>
                <p>{t('fields')}</p>
                <p>{t('excluded')}</p>
              </>
            ) : null}
            {id === 'sources' ? (
              <>
                <p>{t('sourcesIntro')}</p>
                {sources.isPending ? <p role="status">{t('sourceLoading')}</p> : null}
                {sources.isFetching && sources.data ? (
                  <p role="status">{t('sourceRefreshing')}</p>
                ) : null}
                {sources.isError ? (
                  <>
                    {sources.data ? (
                      <p role="status" className="note note--warn">
                        {t('sourceStale')}
                      </p>
                    ) : null}
                    <LoadErrorState
                      description={t('sourceError')}
                      context={t('sourceErrorContext')}
                      retry={() => {
                        void sources.refetch();
                      }}
                      {...(sources.error instanceof ApiReadError && sources.error.requestId
                        ? { requestId: sources.error.requestId }
                        : {})}
                    />
                  </>
                ) : null}
                {sources.data?.sources.length === 0 ? <p>{t('sourceEmpty')}</p> : null}
                {sources.data && sources.data.sources.length > 0 ? (
                  <ul className="privacy-sources">
                    {sources.data.sources.map((source) => (
                      <Source key={source.sourceId} source={source} />
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            {id === 'purpose' ? (
              <>
                <p>{t('purpose')}</p>
                <p>{t('purposeLimits')}</p>
              </>
            ) : null}
            {id === 'basis' ? (
              <>
                <p>{t('basis')}</p>
                <p>{t('gates')}</p>
              </>
            ) : null}
            {id === 'retention' ? (
              <>
                <p>{t('snapshots')}</p>
                <p>{t('history')}</p>
                <p>{t('checkpoints')}</p>
              </>
            ) : null}
            {id === 'sharing' ? (
              <>
                <p>{t('sharing')}</p>
                <p>{t('models')}</p>
              </>
            ) : null}
            {id === 'rights' ? <p>{t('rights')}</p> : null}
            {id === 'removal' ? (
              <>
                <p>{t('removal')}</p>
                <p>{t('removalLimit')}</p>
              </>
            ) : null}
            {id === 'controller' ? (
              <>
                <p>{t('controllerRole')}</p>
                <p>
                  {config.privacyControllerName ? (
                    <>
                      {t('controllerName')} <strong>{config.privacyControllerName}</strong>
                    </>
                  ) : (
                    t('controllerMissing')
                  )}
                </p>
                <p>
                  {config.privacyContactEmail ? (
                    <>
                      {t('contactLabel')}{' '}
                      <a href={`mailto:${config.privacyContactEmail}`}>
                        {config.privacyContactEmail}
                      </a>
                    </>
                  ) : (
                    t('contactMissing')
                  )}
                </p>
              </>
            ) : null}
          </section>
        ))}
        <p className="privacy-closing">{t('closing')}</p>
      </article>
    </main>
  );
}
