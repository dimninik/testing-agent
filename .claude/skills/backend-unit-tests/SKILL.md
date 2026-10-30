---
name: backend-unit-tests
description: Conventions and patterns for writing Vitest + Supertest unit tests for the Express/Prisma backend in backend/. Use whenever you create or update a test under backend/tests/.
---

# Backend unit tests

## When to use

Every time you create or change a file in `backend/tests/`.

## Steps

1. Find the test file. Tests sit flat in `backend/tests/`, named after the source file:
   `src/core/config.ts` → `tests/config.test.ts`.
2. Read the closest existing test, e.g. `router.test.ts`, `repository.test.ts`.
3. Import from `vitest` explicitly. Import sources **with** the `.ts` extension:
   `import { createApp } from '../src/factory.ts'`.
4. Reuse fixtures from `tests/fixture.ts`. `record` is a database row, `todo` is the API JSON.
5. Pick the isolation pattern for what the code touches:

   | Code touches | Pattern |
   |---|---|
   | Prisma | `createDatabase('postgresql://test:test@localhost:5432/test')`, then `vi.spyOn(database.todo, 'findMany').mockResolvedValue([record])` |
   | Only part of Prisma | `{ todo: { findFirst: vi.fn() } } as unknown as Database` |
   | HTTP routes | `request(createApp(database)).get('/api/health')` with `supertest` |
   | A single router | fresh `express()` + `express.json()` + a `TodoStore` made of `vi.fn()` |
   | Environment variables | `vi.stubEnv(name, value)`, `vi.unstubAllEnvs()` in `afterEach` |
   | Code that runs on import | `vi.mock(...)` the dependency, `vi.resetModules()`, then `await import(...)` |
   | `process.exit` and signals | `vi.spyOn(process, 'exit')` and `vi.spyOn(process, 'once')` with fake implementations |
   | Starting a server | mock `createApp` so `listen` calls back with a fake server object |
   | Time | `vi.useFakeTimers()`, `vi.setSystemTime(...)`, `vi.useRealTimers()` in `afterEach` |
   | Expected `console.error` | `vi.spyOn(console, 'error').mockImplementation(() => {})` and assert on it |

6. Assert the behavior:
   - status code **and** body for every route branch: 2xx, 404, 422, 413, 500;
   - invalid input never reaches the repository: `expect(repo.create).not.toHaveBeenCalled()`;
   - exact call arguments where they hold business rules: ordering, dates, `updated_at`;
   - errors: `await expect(fn()).rejects.toThrow('...')` and cleanup such as `$disconnect`.
7. Call `vi.restoreAllMocks()` in `afterEach` whenever you use `vi.spyOn`.

## Rules

- No real database, network, `.env` file or open port.
- `validators.ts` and `mappers.ts` must stay at 100% coverage. Test every new branch in them.
- Don't edit `backend/src/`, `vitest.config.ts`, `package.json` or `tsconfig*`.
- Don't snapshot whole responses. Assert the fields that matter.
- Tests must not depend on each other or on their order.
- Style: short top-level `it(...)` blocks, `it.each` for input tables, names that describe behavior.

## Example

```ts
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

it('returns 500 when the health check fails', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(new Error('db down'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(createApp(database)).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalled();
});
```
