import { buildCategoryQuery, isComponentCategory } from '../registry/category-registry.js';
import { shopRegistry, ShopRegistry } from '../registry/shop-registry.js';
import type { ComponentItem, ComponentSearchFilters } from '../types/component.js';

export class SearchService {
  constructor(private registry: ShopRegistry = shopRegistry) {}

  /**
   * Search across registered shops based on filters and country constraints.
   */
  async search(filters: ComponentSearchFilters): Promise<ComponentItem[]> {
    const shops = this.registry.getShopsForCountries(filters.countries);
    if (shops.length === 0) {
      return [];
    }

    let searchQuery = (filters.query || '').trim();

    if (!searchQuery && filters.type && isComponentCategory(filters.type)) {
      searchQuery = buildCategoryQuery(filters.type, filters.subtypeOrSpecs);
    }

    if (!searchQuery) {
      return [];
    }

    const searchOptions = {
      limit: filters.limit ?? 10,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      inStockOnly: filters.inStockOnly,
    };

    const results = await Promise.allSettled(
      shops.map(async (shop) => {
        // If searching a category, customize keyword for German vs Global store
        let queryForShop = searchQuery;
        if (filters.type && isComponentCategory(filters.type)) {
          const regionHint = shop.metadata.region === 'global' ? 'global' : 'de';
          queryForShop = buildCategoryQuery(filters.type, filters.subtypeOrSpecs, regionHint);
        }
        return shop.search(queryForShop, searchOptions);
      })
    );

    const items: ComponentItem[] = [];
    for (const res of results) {
      if (res.status === 'fulfilled') {
        items.push(...res.value);
      }
    }

    return items;
  }

  /**
   * Lookup a component by its composite slug `${shopId}:${itemId}`.
   */
  async getBySlug(slug: string): Promise<ComponentItem | null> {
    const parts = slug.split(':');
    if (parts.length < 2) {
      return null;
    }
    const shopId = parts[0];
    const shop = this.registry.getShop(shopId);
    if (!shop) {
      return null;
    }
    return shop.getBySlug(slug);
  }

  /**
   * Lookup a component by explicit shop identifier and item ID.
   */
  async getById(shopId: string, itemId: string): Promise<ComponentItem | null> {
    const shop = this.registry.getShop(shopId);
    if (!shop) {
      return null;
    }
    return shop.getById(itemId);
  }
}

export const searchService = new SearchService();
