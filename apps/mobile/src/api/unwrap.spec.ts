import { z } from 'zod';

import { errorFromResponse, expectSuccess, unwrap, unwrapWith } from './unwrap';

function result<D>(status: number, data?: D, error?: unknown) {
  return Promise.resolve({
    data,
    error,
    response: new Response(null, { status, headers: { 'X-Request-Id': 'req-1' } }),
  });
}

describe('unwrap', () => {
  it('returns the data of a successful envelope', async () => {
    await expect(unwrap(result(200, { data: { id: '1' }, message: 'OK' }))).resolves.toEqual({
      id: '1',
    });
  });

  it('throws an AppError with status, request id, server message and field errors', async () => {
    await expect(
      unwrap(
        result(400, undefined, {
          data: null,
          message: 'Invalid body',
          errors: [{ path: 'title', message: 'Required' }],
        }),
      ),
    ).rejects.toMatchObject({
      kind: 'validation',
      details: {
        status: 400,
        requestId: 'req-1',
        serverMessage: 'Invalid body',
        fieldErrors: [{ path: 'title', message: 'Required' }],
      },
    });
  });

  it('copes with error bodies that are not envelopes (a proxy page)', () => {
    const error = errorFromResponse(
      new Response(null, { status: 502 }),
      '<html>Bad gateway</html>',
    );
    expect(error.kind).toBe('server');
    expect(error.details.serverMessage).toBeUndefined();
  });

  it('treats a success without a body as a server error', async () => {
    await expect(unwrap(result(200))).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('unwrapWith', () => {
  const Schema = z.object({ id: z.string() });

  it('validates the data against the schema', async () => {
    await expect(
      unwrapWith(result(200, { data: { id: '1' }, message: 'OK' }), Schema),
    ).resolves.toEqual({ id: '1' });
  });

  it('refuses data that breaks the contract', async () => {
    await expect(
      unwrapWith(result(200, { data: { id: 1 }, message: 'OK' }), Schema),
    ).rejects.toMatchObject({
      kind: 'server',
      message: 'The response does not match the contract',
    });
  });
});

describe('expectSuccess', () => {
  it('resolves for an answer without a body', async () => {
    await expect(expectSuccess(result(204))).resolves.toBeUndefined();
    await expect(expectSuccess(result(202))).resolves.toBeUndefined();
  });

  it('throws the AppError of a failure', async () => {
    await expect(
      expectSuccess(result(403, undefined, { data: null, message: 'The password is wrong' })),
    ).rejects.toMatchObject({
      kind: 'forbidden',
      details: { status: 403, serverMessage: 'The password is wrong' },
    });
  });
});
