import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { remove: vi.fn() } }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

it('removes the deleted task from the cache', async () => {
  const { client, wrapper } = setup()
  const other = { ...todoFixture, id: 9 }
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(7))
  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('does not create a cache entry when the list was never loaded', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(7))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})
