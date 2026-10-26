import type { AskPresentedRun } from './ask-view';
import { useTranslation } from 'react-i18next';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';

export function AskThread({
  runs,
  selected,
  onSelect,
}: {
  readonly runs: readonly AskPresentedRun[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('ask');
  return (
    <section className="ask-thread panel" aria-labelledby="ask-thread-title">
      <h2 id="ask-thread-title">
        {t(runs[0]?.basis === 'prepared-ask-example' ? 'thread' : 'liveThread')}
      </h2>
      <ul className="rows">
        {runs.toReversed().map((run) => (
          <li key={run.id}>
            <button
              type="button"
              aria-pressed={selected === run.id}
              onClick={() => onSelect(run.id)}
            >
              <span className="spread">
                <span
                  className={`st ${run.result?.kind === 'unavailable_intent' ? 'st--off' : run.state === 'completed' ? 'st--ok' : ''}`}
                >
                  {t(run.result?.kind === 'unavailable_intent' ? 'unavailable' : run.state)}
                </span>
              </span>
              <span>{run.question}</span>
              <time className="small muted" dateTime={run.createdAt}>
                {formatComputedAt(run.createdAt, i18n.language as Locale)}
              </time>
            </button>
          </li>
        ))}
      </ul>
      <p className="ask-origin">{t('threadHint')}</p>
    </section>
  );
}
