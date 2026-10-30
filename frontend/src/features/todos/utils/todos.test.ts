import { afterEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  summarizeTodos,
  validateTodo,
} from './todos'

const input = {
  title: 'Task',
  description: '',
  priority: 'low' as const,
  due_date: null,
  completed: false,
}

afterEach(() => vi.useRealTimers())

describe('validateTodo', () => {
  it('accepts valid input', () => {
    expect(validateTodo({ ...input, due_date: '2026-02-28' })).toEqual({})
  })
  it('requires a title', () => {
    expect(validateTodo({ ...input, title: '   ' }).title).toBe(
      'Enter a task title.',
    )
  })
  it('rejects a title over 120 characters but allows exactly 120', () => {
    expect(validateTodo({ ...input, title: 'a'.repeat(121) }).title).toMatch(
      /120/,
    )
    expect(validateTodo({ ...input, title: 'a'.repeat(120) })).toEqual({})
  })
  it('rejects a description over 2000 characters', () => {
    expect(
      validateTodo({ ...input, description: 'a'.repeat(2001) }).description,
    ).toMatch(/2000/)
    expect(validateTodo({ ...input, description: 'a'.repeat(2000) })).toEqual(
      {},
    )
  })
  it.each(['2026-2-1', 'abcd-ef-gh', '2026-02-30', '2026-13-01'])(
    'rejects invalid date %s',
    (due_date) => {
      expect(validateTodo({ ...input, due_date }).due_date).toBe(
        'Enter a valid date.',
      )
    },
  )
})

describe('selectTodos', () => {
  const a = {
    ...todoFixture,
    id: 1,
    title: 'Alpha',
    priority: 'low' as const,
    due_date: '2026-11-01',
    created_at: '2026-01-01T00:00:00Z',
  }
  const b = {
    ...todoFixture,
    id: 2,
    title: 'Beta',
    description: 'findme',
    priority: 'high' as const,
    completed: true,
    due_date: null,
    created_at: '2026-01-03T00:00:00Z',
  }
  const c = {
    ...todoFixture,
    id: 3,
    title: 'Gamma',
    priority: 'high' as const,
    due_date: '2026-11-01',
    created_at: '2026-01-03T00:00:00Z',
  }
  const all: Todo[] = [a, b, c]
  const ids = (list: Todo[]) => list.map((t) => t.id)

  it('filters by status', () => {
    expect(ids(selectTodos(all, 'active', '', 'newest'))).toEqual([3, 1])
    expect(ids(selectTodos(all, 'completed', '', 'newest'))).toEqual([2])
    expect(ids(selectTodos(all, 'all', '', 'newest'))).toEqual([3, 2, 1])
  })
  it('searches title and description case-insensitively and trimmed', () => {
    expect(ids(selectTodos(all, 'all', '  FINDME ', 'newest'))).toEqual([2])
    expect(ids(selectTodos(all, 'all', 'alpha', 'newest'))).toEqual([1])
  })
  it('sorts by priority then newest id', () => {
    expect(ids(selectTodos(all, 'all', '', 'priority'))).toEqual([3, 2, 1])
  })
  it('sorts by due date with undated last, ties by id desc', () => {
    expect(ids(selectTodos(all, 'all', '', 'due'))).toEqual([3, 1, 2])
  })
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...todoFixture, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...todoFixture, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })
  it('does not mutate the input', () => {
    selectTodos(all, 'all', '', 'priority')
    expect(ids(all)).toEqual([1, 2, 3])
  })
})

describe('isOverdue', () => {
  it('compares against the local date', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    expect(isOverdue({ ...todoFixture, due_date: '2026-10-14' })).toBe(true)
    expect(isOverdue({ ...todoFixture, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...todoFixture, due_date: null })).toBe(false)
    expect(
      isOverdue({ ...todoFixture, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
  })
})

describe('summarizeTodos', () => {
  it('returns zeros and a 0% rate for an empty list', () => {
    expect(summarizeTodos([])).toEqual({
      total: 0,
      completed: 0,
      active: 0,
      overdue: 0,
      completionRate: 0,
    })
  })
  it('counts completed, active and overdue and rounds the rate', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const todos = [
      { ...todoFixture, id: 1, completed: true, due_date: '2026-10-01' },
      { ...todoFixture, id: 2, due_date: '2026-10-14' },
      { ...todoFixture, id: 3, due_date: '2026-10-20' },
    ]
    expect(summarizeTodos(todos)).toEqual({
      total: 3,
      completed: 1,
      active: 2,
      overdue: 1,
      completionRate: 33,
    })
  })
  it('reports 100% when all are completed', () => {
    expect(
      summarizeTodos([{ ...todoFixture, completed: true }]).completionRate,
    ).toBe(100)
  })
})

describe('formatDate', () => {
  it('formats as day short-month year', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})

describe('priorityLabels', () => {
  it('maps priorities to labels', () => {
    expect(priorityLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    })
  })
})
