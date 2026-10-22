import { stubFetch, failure, ok } from '@/test/http';

import { onUpgradeRequired, publicApi } from './client';

// The client's own wiring: who hears that the API stopped serving this
// version (src/features/update registers here).

describe('onUpgradeRequired', () => {
  it('tells every listener of a 426 until it unsubscribes', async () => {
    const fetchStub = stubFetch({
      'GET /api/auth/capabilities': () => failure(426, 'Update the app'),
    });
    const listener = jest.fn();
    const unsubscribe = onUpgradeRequired(listener);
    await publicApi.GET('/api/auth/capabilities');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await publicApi.GET('/api/auth/capabilities');
    expect(listener).toHaveBeenCalledTimes(1);

    fetchStub.on('GET /api/auth/capabilities', () =>
      ok({ passwordReset: true, signUp: true, emailChange: true, invitations: true }),
    );
    fetchStub.restore();
  });
});
