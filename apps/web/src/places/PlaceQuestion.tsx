import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PlaceRef } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { destinationPath } from '../shell/public-routes';
import { placeName } from './locale';

export function PlaceQuestion({ place }: { readonly place: PlaceRef }) {
  const { t, i18n } = useTranslation('place');
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  function continueDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim())
      void navigate(destinationPath('ask', place.id), {
        state: { placeId: place.id, questionDraft: draft.trim() },
      });
  }
  return (
    <form className="ask place-question" onSubmit={continueDraft}>
      <label htmlFor="place-question">
        {t('askAbout', { name: placeName(place.name, i18n.language) })}
      </label>
      <div className="ask__box">
        <input
          id="place-question"
          type="text"
          required
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby="place-question-hint"
        />
        <button type="submit">{t('continueAsk')}</button>
      </div>
      <p id="place-question-hint" className="small">
        {t('draftHint')}
      </p>
    </form>
  );
}
