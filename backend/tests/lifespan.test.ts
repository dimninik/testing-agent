import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  initialize: vi.fn(),
  resolveDatabaseUrl: vi.fn(),
  createApp: vi.fn(),
}));
vi.mock('../src/core/database.ts', () => ({ createDatabase: mocks.createDatabase, initialize: mocks.initialize }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: mocks.resolveDatabaseUrl }));
vi.mock('../src/factory.ts', () => ({ createApp: mocks.createApp }));

import { start } from '../src/core/lifespan.ts';

function fakeServer() {
  const server = new EventEmitter() as EventEmitter & { address: () => { port: number }; close: ReturnType<typeof vi.fn> };
  server.address = () => ({ port: 8123 });
  server.close = vi.fn();
  return server;
}

let database: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };
let server: ReturnType<typeof fakeServer>;
let listen: ReturnType<typeof vi.fn>;
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  originalExitCode = process.exitCode;
  database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  server = fakeServer();
  listen = vi.fn((port: number, host: string, callback: () => void) => {
    queueMicrotask(callback); // like a real listen, the callback fires asynchronously
    return server;
  });
  mocks.createDatabase.mockReturnValue(database);
  mocks.initialize.mockResolvedValue(undefined);
  mocks.resolveDatabaseUrl.mockReturnValue('postgresql://x/y');
  mocks.createApp.mockReturnValue({ listen });
  vi.spyOn(process, 'once').mockImplementation((() => process) as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

it('connects, initializes and listens on the configured port', async () => {
  vi.stubEnv('API_PORT', '9001');
  const result = await start();
  expect(mocks.createDatabase).toHaveBeenCalledWith('postgresql://x/y');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(mocks.initialize).toHaveBeenCalledWith(database);
  expect(listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
  expect(result).toEqual({ server, database });
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 8123');
});

it('defaults to port 8000', async () => {
  vi.stubEnv('API_PORT', '');
  await start();
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it('registers SIGTERM and SIGINT handlers', async () => {
  await start();
  const signals = vi.mocked(process.once).mock.calls.map((call) => call[0]);
  expect(signals).toEqual(['SIGTERM', 'SIGINT']);
});

it('disconnects and rethrows when startup fails', async () => {
  mocks.initialize.mockRejectedValue(new Error('init failed'));
  await expect(start()).rejects.toThrow('init failed');
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(listen).not.toHaveBeenCalled();
});

it('rejects when the server emits an error', async () => {
  listen.mockImplementation(() => server);
  const pending = start();
  await vi.waitFor(() => expect(listen).toHaveBeenCalled());
  server.emit('error', new Error('EADDRINUSE'));
  await expect(pending).rejects.toThrow('EADDRINUSE');
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

async function getShutdown() {
  await start();
  return vi.mocked(process.once).mock.calls[0][1] as () => void;
}

it('shutdown closes the server and disconnects the database', async () => {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  vi.useFakeTimers();
  const shutdown = await getShutdown();
  shutdown();
  expect(server.close).toHaveBeenCalledOnce();
  await server.close.mock.calls[0][0]();
  expect(database.$disconnect).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(20000);
  expect(exit).not.toHaveBeenCalled();
});

it('shutdown forces exit when the server does not close in time', async () => {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  vi.useFakeTimers();
  const shutdown = await getShutdown();
  shutdown();
  vi.advanceTimersByTime(10000);
  expect(exit).toHaveBeenCalledWith(1);
});

it('shutdown logs disconnect errors and sets a failing exit code', async () => {
  const error = new Error('disconnect failed');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  const shutdown = await getShutdown();
  database.$disconnect.mockRejectedValue(error);
  shutdown();
  await server.close.mock.calls[0][0]();
  expect(log).toHaveBeenCalledWith(error);
  expect(process.exitCode).toBe(1);
});
