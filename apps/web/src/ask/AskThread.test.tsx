// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocale } from '../places/locale';
import { AskThread } from './AskThread';
import { completed, prior } from './ask-fixtures.test';
afterEach(cleanup);
it('selects actual recorded history and current evidence with native buttons', async () => {
  const select = vi.fn();
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <AskThread runs={[prior, completed]} selected={completed.id} onSelect={select} />
    </I18nextProvider>,
  );
  const history = screen.getByRole('button', {
    name: new RegExp(prior.question.replace('?', '\\?')),
  });
  await userEvent.click(history);
  expect(select).toHaveBeenCalledWith(prior.id);
  expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(completed.question);
});
