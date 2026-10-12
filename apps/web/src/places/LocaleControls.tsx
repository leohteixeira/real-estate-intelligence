import { useTranslation } from 'react-i18next';
import { saveLocale } from './locale';

export function LocaleControls() {
  const { t, i18n } = useTranslation();
  return (
    <div className="lang" role="group" aria-label={t('language')}>
      {(['en', 'pt-BR'] as const).map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-label={locale === 'en' ? 'English' : 'Português'}
          aria-pressed={i18n.language === locale}
          onClick={() => {
            saveLocale(locale);
            void i18n.changeLanguage(locale);
          }}
        >
          {locale === 'en' ? 'EN' : 'PT'}
        </button>
      ))}
    </div>
  );
}
