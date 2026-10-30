import { expect, it, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

it('creates the todos table when initializing', async () => {
  const executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw: executeRaw } as unknown as Database);
  expect(executeRaw).toHaveBeenCalledOnce();
  const sql = executeRaw.mock.calls[0][0].join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain("priority IN ('low', 'medium', 'high')");
});

it('propagates initialization errors', async () => {
  const database = { $executeRaw: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as Database;
  await expect(initialize(database)).rejects.toThrow('boom');
});
