import { useTranslation } from 'react-i18next';
import { LoadErrorState, LoadingState } from '../shared/SystemStates';
import { PlaceReadError } from './place-client';

export function OverviewReadState({
  pending,
  error,
  retry,
  label,
}: {
  readonly pending: boolean;
  readonly error: Error | null;
  readonly retry: () => void;
  readonly label: string;
}) {
  const { t } = useTranslation('place');
  if (pending) return <LoadingState label={t('loadingSection', { section: label })} />;
  if (!error) return null;
  return (
    <LoadErrorState
      description={t('failedSection', { section: label })}
      retry={retry}
      {...(error instanceof PlaceReadError && error.requestId
        ? { requestId: error.requestId }
        : {})}
    />
  );
}
