//  for OTP and refresh token storage.
// Data lives only while the server is running (which is fine for short-lived OTPs).
// For refresh tokens this is also fine — they're invalidated on logout
// and expire naturally via the JWT expiry anyway.

interface Entry {
  value: string;
  expiresAt: number; // Unix timestamp (ms)
}

const store = new Map<string, Entry>();

// Clean up expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

// Store a value with a TTL in seconds (same interface as Redis setex)
export function memSet(key: string, ttlSeconds: number, value: string): void {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Get a value — returns null if not found or expired (same as Redis get)
export function memGet(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

// Delete a value 
export function memDel(key: string): void {
  store.delete(key);
}
