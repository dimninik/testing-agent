import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
afterEach(() => vi.useRealTimers())

function renderItem(
  todo = todoFixture,
  handlers: { onToggle?: () => void; onDelete?: () => void } = {},
  busy = false,
) {
  return render(
    <TodoItem
      todo={todo}
      busy={busy}
      onEdit={vi.fn()}
      onToggle={handlers.onToggle ?? vi.fn()}
      onDelete={handlers.onDelete ?? vi.fn()}
    />,
  )
}

it('forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  renderItem(todoFixture, { onToggle, onDelete })
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('shows a completed task with its description', () => {
  renderItem({ ...todoFixture, completed: true, description: 'Some details' })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('Some details')).toBeVisible()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeChecked()
})

it('hides the description and due date when they are empty', () => {
  renderItem()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
})

it('flags a past due date as overdue', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  renderItem({ ...todoFixture, due_date: '2026-10-10' })
  expect(screen.getByText(/10 Oct 2026 · overdue/)).toBeVisible()
})

it('shows a future due date without the overdue label', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  renderItem({ ...todoFixture, due_date: '2026-10-20' })
  expect(screen.getByText(/20 Oct 2026/)).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('disables all actions while busy', () => {
  renderItem(todoFixture, {}, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})
