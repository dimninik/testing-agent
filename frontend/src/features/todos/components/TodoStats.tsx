import { Badge, Text } from '../../../design-system'
import type { Todo } from '../types'
import { summarizeTodos } from '../utils/todos'

export function TodoStats({ todos }: { todos: Todo[] }) {
  const stats = summarizeTodos(todos)
  return (
    <section className="row compact" aria-label="Task summary">
      <Text muted>
        {`${stats.completed} of ${stats.total} tasks done (${stats.completionRate}%)`}
      </Text>
      <Badge variant="info">{stats.active} active</Badge>
      {stats.overdue > 0 && (
        <Badge variant="warning">{stats.overdue} overdue</Badge>
      )}
    </section>
  )
}
