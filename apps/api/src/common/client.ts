import type { Request } from 'express';

/**
 * The buyer's IP as the server sees it (decision 2: never trust a browser-sent IP).
 * On Render the request passes through a proxy, so the real address is in a header:
 * a single-client header if the edge sets one, otherwise the first X-Forwarded-For entry.
 */
export function clientIp(req: Request): string {
  for (const name of ['cf-connecting-ip', 'true-client-ip']) {
    const value = req.header(name);
    if (value) return value.trim();
  }
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}

/** "Windows / Chrome" from a user agent. Coarse on purpose: it is evidence, not tracking. */
export function deviceOf(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Unknown browser';
  return `${os} / ${browser}`;
}
