import { expect, it } from 'vitest';
import { summarizeTodos } from '../src/features/todos/stats.ts';
import { todo } from './fixture.ts';

it('returns zeros for an empty list', () => {
  expect(summarizeTodos([], '2026-10-15')).toEqual({
    total: 0, completed: 0, active: 0, overdue: 0, byPriority: { low: 0, medium: 0, high: 0 },
  });
});

it('counts completed, active and priorities', () => {
  const todos = [
    { ...todo, id: 1, priority: 'high' as const, completed: true },
    { ...todo, id: 2, priority: 'low' as const, due_date: null },
    { ...todo, id: 3, priority: 'low' as const, due_date: null },
    { ...todo, id: 4, priority: 'medium' as const, due_date: null },
  ];
  expect(summarizeTodos(todos, '2026-10-15')).toEqual({
    total: 4, completed: 1, active: 3, overdue: 0, byPriority: { low: 2, medium: 1, high: 1 },
  });
});

it('counts only active tasks due strictly before today as overdue', () => {
  const todos = [
    { ...todo, id: 1, due_date: '2026-10-14' },
    { ...todo, id: 2, due_date: '2026-10-15' },
    { ...todo, id: 3, due_date: '2026-10-16' },
    { ...todo, id: 4, due_date: null },
    { ...todo, id: 5, due_date: '2026-10-01', completed: true },
  ];
  const stats = summarizeTodos(todos, '2026-10-15');
  expect(stats.overdue).toBe(1);
  expect(stats.active).toBe(4);
  expect(stats.completed).toBe(1);
});
