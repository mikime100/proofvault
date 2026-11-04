import { TrackRequest } from '@proofvault/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init, track } from './index';

afterEach(() => vi.unstubAllGlobals());

describe('sdk', () => {
  it('sends a TrackRequest the api accepts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    init({ apiUrl: 'http://api.test', paypalOrderId: 'PP-ORDER-1' });
    await track('lesson_view', { lesson: '2' });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/track');
    expect(() => TrackRequest.parse(JSON.parse(opts.body))).not.toThrow();
  });

  it('does not throw when the api is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    init({ apiUrl: 'http://api.test', paypalOrderId: 'PP-ORDER-1' });
    await expect(track('download')).resolves.toBeUndefined();
  });
});
