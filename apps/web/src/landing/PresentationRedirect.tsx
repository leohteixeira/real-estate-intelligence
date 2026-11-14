import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { presentationUrl } from './presentation-url';
export function PresentationRedirect() {
  const { i18n } = useTranslation();
  const destination = presentationUrl(window.location.hash, i18n.language);
  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);
  return (
    <main>
      <h1>Real Estate Intelligence</h1>
      <a href={destination}>Explore the project in the portfolio</a>
    </main>
  );
}
