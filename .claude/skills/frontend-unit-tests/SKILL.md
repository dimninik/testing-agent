---
name: frontend-unit-tests
description: Conventions and patterns for writing Vitest + React Testing Library unit tests for the React/TypeScript frontend in frontend/ (components, hooks, API client, utils). Use whenever you create or update a *.test.ts(x) file under frontend/src/.
---

# Frontend unit tests

## When to use

Every time you create or change a `*.test.ts` or `*.test.tsx` file in `frontend/src/`.

## Steps

1. Put the test next to its source: `Foo.tsx` → `Foo.test.tsx`, `foo.ts` → `foo.test.ts`. Use
   `.tsx` only when the test contains JSX.
2. Read the closest existing test, e.g. `TodoItem.test.tsx`, `TodosPage.test.tsx`.
3. Import from `vitest` explicitly. Imports have **no** file extension.
4. Use `todoFixture` from `src/test/todoFixture`. Make variants with spread:
   `{ ...todoFixture, id: 8, completed: true }`.
5. Pick the isolation pattern for what you test:

   | Testing | Pattern |
   |---|---|
   | Any component | mock the design system: `vi.mock('../../../design-system', () => import('../../../design-system/mocks'))` (fix the relative path) |
   | Component that uses a hook | `vi.mock('../hooks/useX', () => ({ useX: vi.fn() }))` and `vi.mocked(useX).mockReturnValue({...} as unknown as ReturnType<typeof useX>)` |
   | Component with heavy children | replace children with small stubs that expose callbacks as buttons |
   | `todosApi` | mock `../../../lib/http` |
   | `lib/http.ts` | `vi.stubGlobal('fetch', vi.fn())`, return `new Response(JSON.stringify(body), { status })`, `vi.unstubAllGlobals()` in `afterEach` |
   | TanStack Query hooks | real hook + fresh `QueryClient` per test (see Example), mock only `todosApi` |
   | Timers (`useNotice`) | `vi.useFakeTimers()`, `act(() => vi.advanceTimersByTime(4000))`, `vi.useRealTimers()` in `afterEach` |
   | Dates (`isOverdue`, `formatDate`) | `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(...)` |

6. Query and interact like a user:
   - `getByRole`, `getByLabelText`, `getByText`;
   - `getByTestId` only for test ids that exist in the design-system mocks, e.g. `alert`;
   - `const user = userEvent.setup()` and `await user.click(...)`, not `fireEvent`;
   - `findBy*` or `waitFor` for async UI, never `setTimeout`.
7. Cover every state: loading, error, empty, data, disabled or busy, every callback, and error
   paths, e.g. a rejected `mutateAsync` keeps the dialog open.
8. Assert both sides: what was called (`toHaveBeenCalledWith`) and what was not
   (`not.toHaveBeenCalled()`).
9. Format every file you touched: `cd frontend && npx prettier --write <file>`.

## Rules

- Don't edit non-test files in `frontend/src/`. The only exception is shared fixtures in
  `src/test/`.
- Don't edit `vite.config.ts`, `package.json` or `tsconfig.json`.
- Don't test `src/design-system/**`, `*.stories.tsx`, `*.styles.ts`, `index.ts` or types. They are
  excluded from coverage on purpose.
- Don't snapshot DOM trees or assert on styled-components class names.
- If you use fake timers together with `userEvent`, pass
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

## Example

```tsx
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))

it('prepends the created task to the cached list', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  client.setQueryData(todoKeys.list, [{ ...todoFixture, id: 9 }])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([
    todoFixture,
    { ...todoFixture, id: 9 },
  ])
})
```
