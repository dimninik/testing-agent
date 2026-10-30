import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({ todosApi: { list: vi.fn() } }))

function wrapperFor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

it('loads the list passing an abort signal', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = renderHook(() => useTodosQuery(), {
    wrapper: wrapperFor(),
  })
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('exposes the error when loading fails', async () => {
  vi.mocked(todosApi.list).mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useTodosQuery(), {
    wrapper: wrapperFor(),
  })
  await waitFor(() => expect(result.current.error?.message).toBe('down'))
})
