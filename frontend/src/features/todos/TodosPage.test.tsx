import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import type { Todo } from './types'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    onCreate,
  }: {
    disabled: boolean
    onCreate: () => void
  }) => (
    <>
      <h1>Tasks</h1>
      <button disabled={disabled} onClick={onCreate}>
        header create
      </button>
    </>
  ),
}))
vi.mock('./components/TodoStats', () => ({
  TodoStats: ({ todos }: { todos: Todo[] }) => <p>stats for {todos.length}</p>,
}))
vi.mock('./components/TodoFilters', () => ({
  TodoFilters: () => null,
}))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    hasTodos,
    loading,
    failed,
    busy,
    onCreate,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todos: Todo[]
    hasTodos: boolean
    loading: boolean
    failed: boolean
    busy: boolean
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <p>
        list: hasTodos={String(hasTodos)} loading={String(loading)} failed=
        {String(failed)} busy={String(busy)}
      </p>
      <button onClick={onCreate}>list create</button>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>toggle {todo.id}</button>
          <button onClick={() => onEdit(todo)}>edit {todo.id}</button>
          <button onClick={() => onDelete(todo)}>delete {todo.id}</button>
        </div>
      ))}
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div>
      <p>editor: {todo === 'new' ? 'new' : todo.id}</p>
      <button onClick={onClose}>editor close</button>
      <button onClick={() => onSaved('Saved!')}>editor saved</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div>
      <p>deleting: {todo.id}</p>
      <button onClick={onClose}>delete close</button>
      <button onClick={onDeleted}>delete done</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

const todo = todoFixture
const notify = vi.fn()
const mutateAsync = vi.fn()
const reset = vi.fn()

function setup({
  query = {},
  mutation = {},
  busy = false,
}: { query?: object; mutation?: object; busy?: boolean } = {}) {
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todo],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...query,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync,
    ...mutation,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockImplementation((todos) => ({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: todos,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('toggles a task and congratulates on completion', async () => {
  const user = userEvent.setup()
  setup()
  mutateAsync.mockResolvedValue({ ...todo, completed: true })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'toggle 7' }))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: 7,
    input: { completed: true },
  })
  expect(notify).toHaveBeenCalledWith('Another task complete. Well done!')
})

it('notifies when a task is marked active again', async () => {
  const user = userEvent.setup()
  setup()
  mutateAsync.mockResolvedValue({ ...todo, completed: false })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'toggle 7' }))
  expect(notify).toHaveBeenCalledWith('Task marked as active.')
})

it('does not notify when toggling fails', async () => {
  const user = userEvent.setup()
  setup()
  mutateAsync.mockRejectedValue(new Error('fail'))
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'toggle 7' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while busy and disables the header action', async () => {
  const user = userEvent.setup()
  setup({ busy: true })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'header create' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'toggle 7' }))
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('disables the header action while the first load is pending', () => {
  setup({ query: { isPending: true, data: undefined } })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'header create' })).toBeDisabled()
  expect(screen.getByText(/hasTodos=false loading=true/)).toBeVisible()
})

it('shows a toggle error and disables retry while busy or fetching', () => {
  setup({ mutation: { error: new Error('Toggle failed') }, busy: true })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Toggle failed')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('shows the stats summary only when there are tasks', () => {
  setup()
  const { unmount } = render(<TodosPage />)
  expect(screen.getByText('stats for 1')).toBeVisible()
  unmount()
  setup({ query: { data: [] } })
  render(<TodosPage />)
  expect(screen.queryByText(/^stats for/)).not.toBeInTheDocument()
})

it('hides the alert when there is no error', () => {
  setup()
  render(<TodosPage />)
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
})

it('opens the editor for a new task from the header and the list', async () => {
  const user = userEvent.setup()
  setup()
  render(<TodosPage />)
  expect(screen.queryByText(/^editor:/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'header create' }))
  expect(screen.getByText('editor: new')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'editor close' }))
  expect(screen.queryByText(/^editor:/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'list create' }))
  expect(screen.getByText('editor: new')).toBeVisible()
})

it('edits a task and notifies after saving', async () => {
  const user = userEvent.setup()
  setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'edit 7' }))
  expect(screen.getByText('editor: 7')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'editor saved' }))
  expect(notify).toHaveBeenCalledWith('Saved!')
  expect(screen.queryByText(/^editor:/)).not.toBeInTheDocument()
})

it('confirms deletion, notifies and closes the dialog', async () => {
  const user = userEvent.setup()
  setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'delete 7' }))
  expect(screen.getByText('deleting: 7')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'delete close' }))
  expect(screen.queryByText(/^deleting:/)).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'delete 7' }))
  await user.click(screen.getByRole('button', { name: 'delete done' }))
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(screen.queryByText(/^deleting:/)).not.toBeInTheDocument()
})

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})
