import type { ShopAdapter, ShopMetadata } from '../types/shop.js';

export class ShopRegistry {
  private shops = new Map<string, ShopAdapter>();

  /**
   * Register a new shop adapter.
   */
  register(adapter: ShopAdapter): void {
    this.shops.set(adapter.metadata.id, adapter);
  }

  /**
   * Get shop by its ID (e.g. 'berrybase', 'aliexpress').
   */
  getShop(shopId: string): ShopAdapter | undefined {
    return this.shops.get(shopId.toLowerCase());
  }

  /**
   * Get all registered shops.
   */
  getAllShops(): ShopAdapter[] {
    return Array.from(this.shops.values());
  }

  /**
   * Filters shops based on country selection:
   * - No countries provided or empty array: Returns GLOBAL sellers only (e.g. AliExpress).
   * - ['de']: Returns German sellers only.
   * - ['de', 'global']: Returns both German and global sellers.
   * - Case-insensitive matching against shop region, countryCode, and supportedCountries.
   */
  getShopsForCountries(countries?: string[]): ShopAdapter[] {
    const all = this.getAllShops();

    // Default rule: If no countries or empty array, return global sellers only
    if (!countries || countries.length === 0) {
      return all.filter((s) => s.metadata.region.toLowerCase() === 'global');
    }

    const normalized = new Set(countries.map((c) => c.trim().toLowerCase()));

    return all.filter((shop) => {
      const region = shop.metadata.region.toLowerCase();
      const code = shop.metadata.countryCode.toLowerCase();
      return normalized.has(region) || normalized.has(code);
    });
  }

  /**
   * Returns a list of all distinct supported regions/countries across registered shops.
   */
  getSupportedRegions(): string[] {
    const regions = new Set<string>();
    for (const shop of this.shops.values()) {
      regions.add(shop.metadata.region.toLowerCase());
      for (const country of shop.metadata.supportedCountries) {
        regions.add(country.toLowerCase());
      }
    }
    return Array.from(regions);
  }

  /**
   * Metadata list optionally filtered by countries.
   */
  listShopsMetadata(countries?: string[]): ShopMetadata[] {
    return this.getShopsForCountries(countries).map((s) => s.metadata);
  }
}

export const shopRegistry = new ShopRegistry();
