import { afterEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const names = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

function clearEnv() {
  for (const name of names) vi.stubEnv(name, '');
}
function stubParts() {
  vi.stubEnv('POSTGRES_USER', 'user');
  vi.stubEnv('POSTGRES_PASSWORD', 'p@ss');
  vi.stubEnv('POSTGRES_HOST', 'db');
  vi.stubEnv('DB_PORT', '5433');
  vi.stubEnv('POSTGRES_DB', 'my db');
}

afterEach(() => vi.unstubAllEnvs());

it('prefers the override over DATABASE_URL', () => {
  clearEnv();
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});

it('uses DATABASE_URL and rewrites the SQLAlchemy driver prefix', () => {
  clearEnv();
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@h:5432/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
});

it('builds the URL from the individual variables with encoding', () => {
  clearEnv();
  stubParts();
  const url = new URL(resolveDatabaseUrl());
  expect(url.protocol).toBe('postgresql:');
  expect(url.username).toBe('user');
  expect(decodeURIComponent(url.password)).toBe('p@ss');
  expect(url.hostname).toBe('db');
  expect(url.port).toBe('5433');
  expect(url.pathname).toBe('/my%20db');
});

it.each(names.slice(1))('throws when %s is missing', (name) => {
  clearEnv();
  stubParts();
  vi.stubEnv(name, '');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
