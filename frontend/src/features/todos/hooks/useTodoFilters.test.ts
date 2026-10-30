import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const todos = [
  { ...todoFixture, id: 1, title: 'Alpha' },
  { ...todoFixture, id: 2, title: 'Beta', completed: true },
]

it('starts with all tasks, newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible.map((t) => t.id)).toEqual([2, 1])
})

it('applies filter, search and sort changes', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible.map((t) => t.id)).toEqual([2])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('alpha'))
  expect(result.current.visible.map((t) => t.id)).toEqual([1])
  act(() => result.current.setSearch(''))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
})
