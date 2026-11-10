import ct from 'countries-and-timezones';

/**
 * Resolves a valid IANA timezone string from a country code or timezone name.
 * Falls back to "UTC" if nothing can be resolved.
 */
export function resolveTimezone(input?: string): string {
  if (!input) return 'UTC';

  // Already a valid IANA timezone?
  const tz = ct.getTimezone(input);
  if (tz) return tz.name;

  // Maybe it's a country code — grab the first timezone for that country
  const country = ct.getCountry(input.toUpperCase());
  if (country && country.timezones.length > 0) return country.timezones[0];

  return 'UTC';
}
