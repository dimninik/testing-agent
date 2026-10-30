import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const start = vi.hoisted(() => vi.fn());
vi.mock('../src/core/lifespan.ts', () => ({ start }));

let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  originalExitCode = process.exitCode;
  vi.resetModules();
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  start.mockReset();
});

it('starts the API on import', async () => {
  start.mockResolvedValue({});
  await import('../src/main.ts');
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBe(originalExitCode);
});

it('logs and sets a failing exit code when startup fails', async () => {
  const error = new Error('cannot start');
  start.mockRejectedValue(error);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/main.ts');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', error);
});
