import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  return { database, app: createApp(database) };
}

it('returns ok from the health check', async () => {
  const { app, database } = setup();
  const find = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null as never);
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(find).toHaveBeenCalledWith({ select: { id: true } });
});

it('does not expose the x-powered-by header', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null as never);
  const response = await request(app).get('/api/health');
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('serves the OpenAPI specification', async () => {
  const response = await request(setup().app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('openapi');
});

it('serves the Swagger UI', async () => {
  const response = await request(setup().app).get('/docs/');
  expect(response.status).toBe(200);
  expect(response.text).toContain('swagger');
});

it('returns 404 for unknown routes', async () => {
  const response = await request(setup().app).get('/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('lists tasks through the repository', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([record] as never);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
});

it('returns 422 for malformed JSON', async () => {
  const response = await request(setup().app).post('/api/todos').set('Content-Type', 'application/json').send('{bad');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('returns 413 for oversized bodies', async () => {
  const response = await request(setup().app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('delegates to the default handler when headers were already sent', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null as never);
  const original = express.response.json;
  vi.spyOn(express.response, 'json').mockImplementation(function (this: express.Response, body: unknown) {
    original.call(this, body);
    throw new Error('after send');
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  // The custom handler must not log or overwrite the already sent response.
  expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'after send' }));
});

it('returns 500 and logs when a handler fails', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(new Error('db down'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalled();
});
