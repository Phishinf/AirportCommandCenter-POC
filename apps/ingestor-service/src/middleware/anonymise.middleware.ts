import { createHash } from 'crypto';

// Daily rotating salt — in production, store in Redis with daily expiry
let currentSalt: string | null = null;
let saltDate: string | null = null;

function getDailySalt(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (saltDate !== today || !currentSalt) {
    // Derive deterministic but daily-rotating salt
    currentSalt = createHash('sha256')
      .update(`nexus-salt-${today}-${process.env.JWT_SECRET ?? 'default'}`)
      .digest('hex')
      .slice(0, 32);
    saltDate = today;
  }
  return currentSalt;
}

/**
 * Anonymise a MAC address or device identifier using SHA-256 with a daily
 * rotating salt. The same device will hash to the same value within a day
 * but different values on different days, preventing long-term tracking.
 */
export function anonymiseDeviceId(rawMac: string): string {
  const salt = getDailySalt();
  return createHash('sha256').update(salt + rawMac).digest('hex');
}
