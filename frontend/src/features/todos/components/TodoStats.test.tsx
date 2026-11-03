import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoStats } from './TodoStats'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

afterEach(() => vi.useRealTimers())

it('shows progress and active count without an overdue badge', () => {
  render(
    <TodoStats
      todos={[todoFixture, { ...todoFixture, id: 8, completed: true }]}
    />,
  )
  expect(screen.getByLabelText('Task summary')).toBeInTheDocument()
  expect(screen.getByText('1 of 2 tasks done (50%)')).toBeVisible()
  expect(screen.getByText('1 active')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('shows an overdue badge when tasks are overdue', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  render(<TodoStats todos={[{ ...todoFixture, due_date: '2026-10-01' }]} />)
  expect(screen.getByText('1 overdue')).toBeVisible()
  expect(screen.getByText('0 of 1 tasks done (0%)')).toBeVisible()
})
