import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router';
import { parsePlaceMarketResponse, parsePlaceResponse } from '@rei/contracts';
import { createLocale } from '../../src/places/locale';
import { PlacePlate } from '../../src/places/PlacePlate';
import { Figure } from '../../src/shared/Figure';
import {
  LoadingState,
  NoResultsState,
  LoadErrorState,
  StaleFiguresNotice,
} from '../../src/shared/SystemStates';
import '../../src/styles/tokens.css';
import '../../src/styles/components.css';
import '../../src/styles/place.css';
import '../../src/styles/system-states.css';
import './fixture.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';

declare global {
  interface Window {
    systemStatePayload: {
      readonly market: unknown;
      readonly place: unknown;
      readonly locale: 'pt-BR' | 'en';
    };
  }
}
const payload = window.systemStatePayload;
const market = parsePlaceMarketResponse(payload.market);
const place = parsePlaceResponse(payload.place).place;
const median = market.figures.medianAskingPricePerSquareMeter;
if (median.state !== 'available') throw new Error('Owned API must supply the available median');
const availableMedian = median;
const locale = payload.locale;
document.documentElement.lang = locale;
const copy = (pt: string, en: string) => (locale === 'en' ? en : pt);
export function Fixture() {
  const [limit, setLimit] = useState(900000);
  const [retried, setRetried] = useState(false);
  const [noIdRetried, setNoIdRetried] = useState(false);
  return (
    <main className="rei system-fixture">
      <h1>{copy('Casos construídos dos estados do sistema', 'Constructed system state cases')}</h1>
      <p>
        {copy(
          'Condições ilustradas para teste; o valor e a placa vêm da API sintética própria.',
          'Illustrated test conditions; the value and place plate come from the owned synthetic API.',
        )}
      </p>
      <div className="system-fixture__columns">
        <section aria-labelledby="loading">
          <h2 id="loading">{copy('Carregando um lugar', 'Loading a place')}</h2>
          <div className="panel">
            <PlacePlate place={place} />
            <LoadingState label={copy('Carregando mediana…', 'Loading median…')} />
          </div>
        </section>
        <section aria-labelledby="empty">
          <h2 id="empty">{copy('Sem resultados', 'No results')}</h2>
          <div className="panel">
            <NoResultsState
              placeName="Pinheiros"
              filterCount={6}
              responsibleFilter="R$/m²"
              limitMinorUnits={limit}
              lastExcludedCount={41}
              minimumMinorUnits={987000}
              relax={{
                label: copy(
                  'Aumentar o limite para R$ 10.000/m²',
                  'Raise the limit to R$ 10,000/m²',
                ),
                onClick: () => setLimit(1000000),
              }}
              widen={{
                label: copy('Buscar em toda a Zona Oeste', 'Search all of Zona Oeste'),
                href: '#owned-zone',
              }}
              alert={{
                label: copy(
                  'Criar um alerta para estes filtros',
                  'Create an alert for these filters',
                ),
                href: '#owned-alert',
              }}
            />
          </div>
        </section>
        <section aria-labelledby="error">
          <h2 id="error">{copy('Não foi possível carregar', 'Could not load')}</h2>
          <div className="panel">
            {retried ? (
              <p role="status" className="system-state">
                {copy('Ação de recuperação própria executada', 'Owned recovery action executed')}
              </p>
            ) : (
              <LoadErrorState
                description={copy('A leitura de Pinheiros falhou', 'The Pinheiros read failed')}
                context={copy(
                  'Condição construída. Seus filtros e seu lugar foram mantidos.',
                  'Constructed condition. Your filters and place have been retained.',
                )}
                retry={() => setRetried(true)}
                requestId="d392f952-20fa-49b4-8cf6-4da26c8d7abc"
              />
            )}
          </div>
        </section>
        <section aria-labelledby="stale">
          <h2 id="stale">{copy('Números desatualizados', 'Stale figures')}</h2>
          <div className="panel">
            <StaleFiguresNotice
              freshness={{ ...availableMedian.freshness, status: 'stale', ageSeconds: 172800 }}
            />
            <Figure
              label={copy('Mediana do preço pedido por m²', 'Median asking price per m²')}
              priceKind="asking"
              minorUnits={availableMedian.value.minorUnits}
              unit="/m²"
              evidence={availableMedian}
              synthetic
            />
          </div>
        </section>
      </div>
      <section className="system-fixture__edges" aria-labelledby="edge-title">
        <h2 id="edge-title">
          {copy(
            'Casos construídos de texto longo e evidência opcional',
            'Constructed long copy and optional evidence cases',
          )}
        </h2>
        <NoResultsState
          placeName={'BairroCanônico'.repeat(25)}
          filterCount={1234}
          responsibleFilter={copy(
            'Limite máximo de preço pedido por metro quadrado',
            'Maximum asking price per square meter limit',
          )}
          limitMinorUnits={999999999999}
          lastExcludedCount={12345}
          minimumMinorUnits={999999999999}
          relax={{
            label: copy(
              'Aumentar o limite máximo de preço pedido por metro quadrado destes filtros',
              'Raise the maximum asking price per square meter limit for these filters',
            ),
            href: '#owned-limit',
          }}
          widen={{
            label: copy(
              'Ampliar a busca para todos os bairros da zona selecionada',
              'Widen the search to all neighborhoods in the selected zone',
            ),
            href: '#owned-zone',
          }}
        />
        <StaleFiguresNotice
          freshness={{ status: 'stale', ageSeconds: 0 }}
          failure={{ sourceName: 'FonteCanônica'.repeat(25), since: '2026-10-07T06:00:00Z' }}
          collectionStatus={{
            authorized: true,
            href: '#owned-collection',
            label: copy('Situação da coleta construída', 'Constructed collection status'),
          }}
        />
        <StaleFiguresNotice freshness={{ status: 'stale' }} />
        {noIdRetried ? (
          <p role="status" className="system-state">
            {copy('Ação de recuperação própria executada', 'Owned recovery action executed')}
          </p>
        ) : (
          <LoadErrorState
            description={copy(
              'Falha construída sem ID público',
              'Constructed failure without public ID',
            )}
            retry={() => setNoIdRetried(true)}
            requestId="private-invalid-header"
          />
        )}
      </section>
      {['zone', 'alert', 'limit', 'collection'].map((target) => (
        <section key={target} id={`owned-${target}`} tabIndex={-1}>
          <h2>
            {copy('Destino próprio', 'Owned destination')}: {target}
          </h2>
        </section>
      ))}
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing owned state fixture root');
createRoot(root).render(
  <I18nextProvider i18n={createLocale(locale)}>
    <BrowserRouter>
      <Fixture />
    </BrowserRouter>
  </I18nextProvider>,
);
