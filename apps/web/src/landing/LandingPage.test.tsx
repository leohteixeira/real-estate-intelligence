// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocale } from '../places/locale';
import { LandingPage } from './LandingPage';

const scene = vi.hoisted(() => ({
  setProgress: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  setMotion: vi.fn(),
}));
vi.mock('./CityScene', () => ({ mountCityScene: vi.fn(() => scene) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('pauses ongoing motion, honors changed reduced preference and removes listeners on unmount', async () => {
  let reduced = false;
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return reduced;
    },
    addEventListener: vi.fn((_name: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_name: string, listener: () => void) => listeners.delete(listener)),
  };
  vi.stubGlobal('matchMedia', () => query);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const view = render(
    <I18nextProvider i18n={createLocale('en')}>
      <MemoryRouter>
        <LandingPage demoUrl={null} repositoryUrl={null} />
      </MemoryRouter>
    </I18nextProvider>,
  );
  const controls = view.container.querySelector('.lp-controls')!;
  const stage = view.container.querySelector('.lp-stage')!;
  expect(controls).toContainElement(screen.getByRole('button', { name: 'Pause city motion' }));
  expect(controls.querySelector('nav')).not.toBeNull();
  expect(stage.querySelector('button,nav')).toBeNull();
  expect(stage.querySelector('canvas')).not.toBeNull();
  await waitFor(() => expect(scene.setMotion).toHaveBeenCalledWith(false, false));
  await userEvent.click(screen.getByRole('button', { name: 'Pause city motion' }));
  expect(scene.setMotion).toHaveBeenLastCalledWith(false, true);
  await act(async () => {
    reduced = true;
    for (const listener of listeners) listener();
  });
  expect(scene.setMotion).toHaveBeenLastCalledWith(true, true);
  expect(screen.queryByRole('button', { name: /city motion/ })).not.toBeInTheDocument();
  await act(async () => {
    reduced = false;
    for (const listener of listeners) listener();
  });
  await userEvent.click(screen.getByRole('button', { name: 'Resume city motion' }));
  expect(scene.setMotion).toHaveBeenLastCalledWith(false, false);
  view.unmount();
  expect(query.removeEventListener).toHaveBeenCalled();
  expect(listeners.size).toBe(0);
  expect(scene.dispose).toHaveBeenCalledOnce();
});
