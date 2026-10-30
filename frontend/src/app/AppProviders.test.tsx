import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GlobalStyles } from '../design-system'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function ClientProbe({ expected }: { expected: QueryClient }) {
  return <p>{useQueryClient() === expected ? 'same client' : 'other client'}</p>
}

it('renders children with global styles and the default query client', () => {
  render(
    <AppProviders>
      <ClientProbe expected={queryClient} />
    </AppProviders>,
  )
  expect(screen.getByText('same client')).toBeVisible()
  expect(GlobalStyles).toHaveBeenCalled()
})

it('uses a custom query client when provided', () => {
  const client = new QueryClient()
  render(
    <AppProviders client={client}>
      <ClientProbe expected={client} />
    </AppProviders>,
  )
  expect(screen.getByText('same client')).toBeVisible()
})
