import type { Todo } from './types.js';

export interface TodoStats {
  total: number;
  completed: number;
  active: number;
  overdue: number;
  byPriority: Record<Todo['priority'], number>;
}

export function summarizeTodos(todos: Todo[], today: string): TodoStats {
  const stats: TodoStats = {
    total: todos.length,
    completed: 0,
    active: 0,
    overdue: 0,
    byPriority: { low: 0, medium: 0, high: 0 },
  };
  for (const todo of todos) {
    stats.byPriority[todo.priority] += 1;
    if (todo.completed) {
      stats.completed += 1;
      continue;
    }
    stats.active += 1;
    if (todo.due_date && todo.due_date < today) stats.overdue += 1;
  }
  return stats;
}
