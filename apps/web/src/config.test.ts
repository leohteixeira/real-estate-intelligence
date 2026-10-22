import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

describe('readConfig', () => {
  it('uses the same-origin versioned API proxy by default', () => {
    expect(readConfig({}).apiBaseUrl).toBe('');
  });

  it('prefers an explicitly configured base url', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test' }).apiBaseUrl).toBe(
      'https://api.example.test',
    );
  });

  it('ignores a blank base url', () => {
    expect(readConfig({ VITE_API_BASE_URL: '   ' }).apiBaseUrl).toBe('');
  });

  it('has no demo or repository link until one is configured', () => {
    const config = readConfig({});

    expect(config.demoUrl).toBeNull();
    expect(config.repositoryUrl).toBeNull();
  });

  it('accepts only http and https links', () => {
    expect(readConfig({ VITE_DEMO_URL: ' https://demo.example.test ' }).demoUrl).toBe(
      'https://demo.example.test',
    );
    expect(readConfig({ VITE_DEMO_URL: 'javascript:alert(1)' }).demoUrl).toBeNull();
    expect(readConfig({ VITE_REPOSITORY_URL: 'https://git.example.test/rei' }).repositoryUrl).toBe(
      'https://git.example.test/rei',
    );
  });

  it('keeps privacy publication absent by default and preserves safe synthetic configured text', () => {
    expect(readConfig({})).toMatchObject({
      privacyControllerName: null,
      privacyContactEmail: null,
    });
    expect(
      readConfig({
        VITE_PRIVACY_CONTROLLER_NAME: ' Synthetic Privacy Controller ',
        VITE_PRIVACY_CONTACT_EMAIL: 'privacy+fixture@example.test',
      }),
    ).toMatchObject({
      privacyControllerName: 'Synthetic Privacy Controller',
      privacyContactEmail: 'privacy+fixture@example.test',
    });
  });
  it.each([
    '',
    ' ',
    'name\r\ninjection',
    'name\u0000',
    '<script>identity</script>',
    'x'.repeat(201),
  ])('rejects unsafe or blank controller name %#', (name) => {
    expect(readConfig({ VITE_PRIVACY_CONTROLLER_NAME: name }).privacyControllerName).toBeNull();
  });
  it.each([
    '',
    ' ',
    'invalid',
    'name@example.test\r\nBcc:other@example.test',
    'name@example.test?subject=injected',
    'name@example.test#injected',
    'name%0d%0a@example.test',
    ' name@example.test',
    '.name@example.test',
    'name..other@example.test',
    'name@-example.test',
    'name@example',
    'x'.repeat(65) + '@example.test',
    'name@' + 'x'.repeat(250) + '.test',
  ])('rejects unusable or mailto-injecting email %#', (email) => {
    expect(readConfig({ VITE_PRIVACY_CONTACT_EMAIL: email }).privacyContactEmail).toBeNull();
  });
});
