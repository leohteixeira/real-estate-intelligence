import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router';
import { config } from './config';
import { AppRoutes } from './routes';
import { createReadCache } from './places/place-queries';
import { createLocale } from './places/locale';

export function App() {
  const [cache] = useState(createReadCache);
  const [locale] = useState(createLocale);
  return (
    <I18nextProvider i18n={locale}>
      <QueryClientProvider client={cache}>
        <BrowserRouter basename={config.publicBase || '/'}>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
