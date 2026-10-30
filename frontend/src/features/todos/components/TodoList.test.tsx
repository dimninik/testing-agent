import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: () => <p>Empty task list</p>,
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: { title: string }
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title} {busy ? 'busy' : 'idle'}
      <button onClick={onToggle}>toggle</button>
      <button onClick={onEdit}>edit</button>
      <button onClick={onDelete}>delete</button>
    </li>
  ),
}))

const baseProps = {
  todos: [],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows an unavailable message when loading failed without cached tasks', () => {
  render(<TodoList {...baseProps} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch failed', () => {
  render(<TodoList {...baseProps} failed hasTodos todos={[todoFixture]} />)
  expect(screen.getByText(/Prepare a demo/)).toBeVisible()
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('renders tasks and forwards actions with the task', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...baseProps}
      hasTodos
      busy
      todos={[todoFixture]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByText(/busy/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'toggle' }))
  expect(onToggle).toHaveBeenCalledWith(todoFixture)
  expect(onEdit).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'edit' }))
  expect(onEdit).toHaveBeenCalledWith(todoFixture)
  await user.click(screen.getByRole('button', { name: 'delete' }))
  expect(onDelete).toHaveBeenCalledWith(todoFixture)
})

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})
