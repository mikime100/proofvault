/** "196.188.12.7" -> "196.188.x.x". IPv6 keeps the first two groups. Every API response uses this. */
export function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  const groups = ip.split(':');
  return `${groups[0]}:${groups[1]}:x:x`;
}
