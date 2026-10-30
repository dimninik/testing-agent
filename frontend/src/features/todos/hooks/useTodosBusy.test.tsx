import type { ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

it('is true only while a todos mutation is pending', async () => {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let release: () => void = () => {}
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey: todoKeys.create,
        mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    }),
    { wrapper },
  )
  expect(result.current.busy).toBe(false)
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.busy).toBe(true))
  act(() => release())
  await waitFor(() => expect(result.current.busy).toBe(false))
})
