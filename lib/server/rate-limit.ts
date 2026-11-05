/**
 * A small sliding-window limiter keyed by client IP. It lives in memory, so on
 * serverless it limits per instance: enough to stop a runaway loop or casual abuse
 * of a public demo. For hard limits, back it with Redis or the platform firewall.
 */
const windows = new Map<string, number[]>();

export function rateLimit(request: Request, bucket: string, limit: number, windowMs: number): Response | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return Response.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) windows.delete(windows.keys().next().value as string);
  return null;
}
