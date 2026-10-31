/**
 * Currency utilities for standardizing on EUR
 */

export function roundEur(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatEur(amount: number): string {
  const rounded = roundEur(amount);
  return `€ ${rounded.toFixed(2).replace('.', ',')}`;
}

/**
 * Parses a variety of raw price strings into a numeric EUR value.
 * Handles German format (e.g., "1.234,50 €", "12,99 €", "ab 3,45 €")
 * and standard decimal format (e.g., "12.99", "€ 12.99").
 */
export function parseEurPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Clean non-relevant prefixes/suffixes, keeping digits, commas, dots, minus
  let str = raw.trim();

  // Remove common non-numeric terms e.g. "ab", "inkl. MwSt.", "zzgl. Versand", "EUR", "€"
  str = str.replace(/[€\u20AC]/g, '');
  str = str.replace(/\b(ab|EUR|eur|inkl|zzgl|MwSt|Netto|Brutto)\b/gi, '');
  str = str.trim();

  // Find first continuous price pattern
  const match = str.match(/([0-9]+(?:[.,][0-9]{1,3})*(?:[.,][0-9]{1,2})?)/);
  if (!match) return null;

  let clean = match[1];

  // If there are both dots and commas, determine which is the decimal separator
  if (clean.includes('.') && clean.includes(',')) {
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    if (lastComma > lastDot) {
      // German format: 1.234,56
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // US format with comma thousands: 1,234.56
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    // Single comma is typically decimal in German: 12,99
    clean = clean.replace(',', '.');
  }

  const val = parseFloat(clean);
  if (isNaN(val)) return null;

  return roundEur(val);
}
