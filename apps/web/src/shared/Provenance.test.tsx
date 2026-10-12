// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import { Provenance } from './Provenance';
import { evidence } from './shared-fixtures.test';
afterEach(cleanup);
it.each(['pt-BR', 'en'] as const)(
  'keeps distinct fresh, stale and untracked evidence in %s',
  (locale) => {
    for (const status of ['fresh', 'stale', 'untracked'] as const) {
      const view = render(
        <I18nextProvider i18n={createLocale(locale)}>
          <Provenance
            evidence={{
              ...evidence,
              recordCount: 2,
              freshness: { ...evidence.freshness, status },
              sources: [
                ...evidence.sources,
                { ...evidence.sources[0]!, id: 'long', label: 'Long canonical source name' },
              ],
            }}
            synthetic={false}
          />
        </I18nextProvider>,
      );
      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(
        screen.getByRole('link', {
          name: locale === 'en' ? 'Sources: Synthetic source' : 'Fontes: Synthetic source',
        }),
      ).toHaveAccessibleName(
        locale === 'en' ? 'Sources: Synthetic source' : 'Fontes: Synthetic source',
      );
      expect(screen.getByRole('link', { name: 'Long canonical source name' })).toHaveAttribute(
        'href',
        evidence.sources[0]!.url,
      );
      expect(
        screen.getByText(locale === 'en' ? '2 contributing properties' : '2 imóveis contribuintes'),
      ).toBeVisible();
      expect(
        screen.getByText(
          locale === 'en'
            ? status === 'fresh'
              ? 'Fresh data'
              : status === 'stale'
                ? 'Stale data'
                : 'Freshness not tracked'
            : status === 'fresh'
              ? 'Dados atuais'
              : status === 'stale'
                ? 'Dados desatualizados'
                : 'Atualidade não rastreada',
        ),
      ).toBeVisible();
      view.unmount();
    }
  },
);
