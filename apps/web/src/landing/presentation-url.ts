/** The portfolio presentation in the interface language (`/pt/` or `/en/`). */
export function presentationUrl(hash = '', language = 'en'): string {
  const locale = language === 'en' ? 'en' : 'pt';
  return `https://leohteixeira.com/${locale}/projects/real-estate-intelligence${hash}`;
}
