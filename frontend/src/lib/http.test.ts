import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './http'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('prefixes the path, sends JSON headers and parses the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      request('/todos', { headers: { 'X-Test': 'a' } }),
    ).resolves.toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
      headers: { 'Content-Type': 'application/json', 'X-Test': 'a' },
    })
  })

  it('returns undefined for 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    )
    await expect(request('/todos/1')).resolves.toBeUndefined()
  })

  it('throws a connection error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await expect(request('/todos')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('rethrows the original error when the request was aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
      abortError,
    )
  })

  it('maps 422 to a validation message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 422)))
    await expect(request('/todos')).rejects.toThrow(/Check the task details/)
  })

  it('uses the detail string of an error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ detail: 'Not found' }, 404)),
    )
    await expect(request('/todos/1')).rejects.toThrow('Not found')
  })

  it('falls back to a generic message for non-string detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ detail: [1] }, 500)),
    )
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })

  it('falls back to a generic message for an unparsable body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })),
    )
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })
})
