import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { clientIp, deviceOf } from './client';

const req = (headers: Record<string, string>, remote = '10.0.0.1') =>
  ({
    header: (name: string) => headers[name.toLowerCase()],
    socket: { remoteAddress: remote },
  }) as unknown as Request;

describe('clientIp', () => {
  it('prefers the edge single-client header', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '196.188.12.7', 'x-forwarded-for': '1.1.1.1' }))).toBe('196.188.12.7');
  });
  it('falls back to the first X-Forwarded-For entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '196.188.12.7, 10.1.2.3' }))).toBe('196.188.12.7');
  });
  it('falls back to the socket address without the IPv6 prefix', () => {
    expect(clientIp(req({}, '::ffff:127.0.0.1'))).toBe('127.0.0.1');
  });
});

describe('deviceOf', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Windows / Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0', 'Windows / Edge'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'iOS / Safari'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 'Android / Chrome'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0', 'macOS / Firefox'],
    [undefined, 'Unknown OS / Unknown browser'],
  ])('%s', (ua, expected) => {
    expect(deviceOf(ua)).toBe(expected);
  });
});
