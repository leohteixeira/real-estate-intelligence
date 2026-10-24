import { useEffect } from 'react';
import { presentationUrl } from './presentation-url';
export function PresentationRedirect() {
  const destination = presentationUrl(window.location.hash);
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
