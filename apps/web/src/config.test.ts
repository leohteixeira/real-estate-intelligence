import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

describe('readConfig', () => {
  it('falls back to the port assigned to this product', () => {
    expect(readConfig({}).apiBaseUrl).toBe('http://localhost:8200');
  });

  it('prefers an explicitly configured base url', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test' }).apiBaseUrl).toBe(
      'https://api.example.test',
    );
  });

  it('ignores a blank base url', () => {
    expect(readConfig({ VITE_API_BASE_URL: '   ' }).apiBaseUrl).toBe('http://localhost:8200');
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
});
