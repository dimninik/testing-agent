import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))

beforeEach(() => vi.mocked(request).mockReset())

describe('todosApi', () => {
  it('passes the abort signal when fetching tasks', async () => {
    const signal = new AbortController().signal
    vi.mocked(request).mockResolvedValue([todoFixture])
    await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
    expect(request).toHaveBeenCalledWith('/todos', { signal })
  })

  it('sends only writable task fields on creation', async () => {
    vi.mocked(request).mockResolvedValue(todoFixture)
    await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
    expect(request).toHaveBeenCalledWith('/todos', {
      method: 'POST',
      body: JSON.stringify({
        title: todoFixture.title,
        description: '',
        priority: 'medium',
        due_date: null,
        completed: false,
      }),
    })
  })

  it('creates a todo sending only writable fields', async () => {
    const input = {
      title: 'A',
      description: 'd',
      priority: 'high' as const,
      due_date: '2026-10-05',
      completed: false,
      id: 5,
      created_at: 'x',
    }
    await todosApi.create(input)
    const [path, init] = vi.mocked(request).mock.calls[0]
    expect(path).toBe('/todos')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      title: 'A',
      description: 'd',
      priority: 'high',
      due_date: '2026-10-05',
      completed: false,
    })
  })

  it('patches only the given fields', async () => {
    await todosApi.update(3, { completed: true })
    const [path, init] = vi.mocked(request).mock.calls[0]
    expect(path).toBe('/todos/3')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(init?.body as string)).toEqual({ completed: true })
  })

  it('deletes a todo', async () => {
    await todosApi.remove(4)
    expect(request).toHaveBeenCalledWith('/todos/4', { method: 'DELETE' })
  })
})
