import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

it('prepends the created task to the cached list', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [{ ...todoFixture, id: 9 }])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([
    todoFixture,
    { ...todoFixture, id: 9 },
  ])
})

it('replaces a duplicate and works with an empty cache', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('leaves the cache untouched when the request fails', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('boom'))
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture)).rejects.toThrow(
      'boom',
    )
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
