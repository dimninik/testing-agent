import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
    initial,
    error,
    busy,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
    initial?: { title: string }
    error: string | null
    busy: boolean
  }) => (
    <div>
      <p>initial: {initial?.title ?? 'none'}</p>
      <p>busy: {String(busy)}</p>
      {error && <p>error: {error}</p>}
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
    </div>
  ),
}))

function mockMutations(
  create: Record<string, unknown> = {},
  update: Record<string, unknown> = {},
) {
  const base = { isPending: false, error: null, mutateAsync: vi.fn() }
  const createMock = { ...base, mutateAsync: vi.fn(), ...create }
  const updateMock = { ...base, mutateAsync: vi.fn(), ...update }
  vi.mocked(useCreateTodoMutation).mockReturnValue(
    createMock as unknown as ReturnType<typeof useCreateTodoMutation>,
  )
  vi.mocked(useUpdateTodoMutation).mockReturnValue(
    updateMock as unknown as ReturnType<typeof useUpdateTodoMutation>,
  )
  return { create: createMock.mutateAsync, update: updateMock.mutateAsync }
}

it('updates an existing task and reports the saved changes', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations()
  vi.mocked(update).mockResolvedValue(todoFixture)
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(screen.getByText(`initial: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
  expect(create).not.toHaveBeenCalled()
})

it('shows the mutation error and does not report success when saving fails', async () => {
  const user = userEvent.setup()
  const { create } = mockMutations({ error: new Error('Server said no') })
  create.mockRejectedValue(new Error('Server said no'))
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByText('initial: none')).toBeVisible()
  expect(screen.getByText('error: Server said no')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).toHaveBeenCalledTimes(1)
  expect(onSaved).not.toHaveBeenCalled()
})

it('ignores submissions while busy or pending', async () => {
  const user = userEvent.setup()
  const { create } = mockMutations({ isPending: true })
  const onSaved = vi.fn()
  const { rerender } = render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByText('busy: true')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  rerender(<TodoEditor todo="new" busy onClose={vi.fn()} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})
