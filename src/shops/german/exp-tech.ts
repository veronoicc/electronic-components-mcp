import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface ShopifySuggestProduct {
  id: number | string;
  title: string;
  handle: string;
  price: string;
  available: boolean;
  url: string;
  image?: string;
  featured_image?: {
    url?: string;
  };
  vendor?: string;
  type?: string;
}

interface ShopifySuggestResponse {
  resources?: {
    results?: {
      products?: ShopifySuggestProduct[];
    };
  };
}

export class ExpTechShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'exp-tech',
    name: 'EXP Tech',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://www.exp-tech.de',
    shippingPolicy: {
      standardCarrier: 'UPS',
      standardCost: 6.5,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '2-3 Werktage',
      policyUrl: 'https://www.exp-tech.de/policies/shipping-policy',
      notes: 'Versand innerhalb von 24h per UPS Standard (6,50 € nach Deutschland). Kein kostenloser Versand.',
      defaultMethodId: 'ups',
      pickupAvailable: false,
      methods: [
        {
          id: 'ups',
          name: 'UPS Standard',
          type: 'standard',
          carrier: 'UPS',
          cost: 6.5,
          freeShippingThreshold: null,
          deliveryDays: '2-3 Werktage',
          notes: 'Lieferung innerhalb von 2-3 Werktagen in Deutschland',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const suggestUrl = `${this.metadata.baseUrl}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`;
      const data = (await httpClient.fetchJson(suggestUrl)) as ShopifySuggestResponse;
      const products = data.resources?.results?.products ?? [];

      const items: ComponentItem[] = products.map((product) => {
        const id = String(product.handle || product.id);
        const price = roundEur(parseEurPrice(product.price) ?? 0);
        let rawUrl = product.url || `/products/${product.handle}`;
        if (rawUrl.startsWith('/')) {
          rawUrl = `${this.metadata.baseUrl}${rawUrl}`;
        }
        // Clean tracking query params from url
        const cleanUrl = rawUrl.split('?')[0] ?? rawUrl;

        let imageUrl = product.image || product.featured_image?.url || null;
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        return {
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title: product.title,
          brand: product.vendor || null,
          sku: null,
          price,
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock: product.available,
          stockDescription: product.available ? 'Lagernd' : 'Nicht auf Lager',
          url: cleanUrl,
          imageUrl,
          shippingEstimate: '2-3 Werktage per UPS',
          category: product.type || null,
        };
      });

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      const handle = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const productUrl = `${this.metadata.baseUrl}/products/${handle}`;
      const html = await httpClient.fetchHtml(productUrl);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      // Extract JSON-LD for rich details if available
      let sku: string | null = null;
      let brand: string | null = null;
      let ldPrice: number | null = null;
      let ldInStock: boolean | null = null;
      let ldImage: string | null = null;

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).text()) as Record<string, unknown>;
          const graph = Array.isArray(json['@graph']) ? (json['@graph'] as Record<string, unknown>[]) : null;
          const productLd =
            json['@type'] === 'Product'
              ? json
              : graph?.find((item) => item['@type'] === 'Product');
          if (productLd) {
            sku = typeof productLd.sku === 'string' ? productLd.sku : null;
            const brandObj = productLd.brand as { name?: string } | undefined;
            brand = brandObj?.name || null;
            const imgObj = productLd.image as { url?: string } | string | undefined;
            if (typeof imgObj === 'string') {
              ldImage = imgObj;
            } else if (imgObj?.url) {
              ldImage = imgObj.url;
            }
            const rawOffers = productLd.offers;
            const offer = Array.isArray(rawOffers)
              ? (rawOffers[0] as Record<string, unknown> | undefined)
              : (rawOffers as Record<string, unknown> | undefined);
            if (offer) {
              if (offer.price !== undefined) {
                ldPrice = roundEur(Number(offer.price));
              }
              if (offer.availability) {
                ldInStock = String(offer.availability).includes('InStock');
              }
              if (!sku && typeof offer.sku === 'string') {
                sku = offer.sku;
              }
            }
          }
        } catch {
          // ignore json-ld parse errors
        }
      });

      const rawPrice = $('.price, [class*="price"]').first().text();
      const price = ldPrice ?? parseEurPrice(rawPrice) ?? 0;

      const inventoryText = $('.product-form__inventory, [class*="inventory"], [class*="stock"]').first().text().toLowerCase();
      const inStock = ldInStock ?? (inventoryText.includes('lager') && !inventoryText.includes('nicht'));

      let imageUrl = ldImage || $('img[src*="/products/"]').first().attr('src') || null;
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = `https:${imageUrl}`;
      }

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand,
        sku,
        price,
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: inStock ? 'Lagernd' : 'Nicht auf Lager',
        url: productUrl,
        imageUrl,
        shippingEstimate: '2-3 Werktage per UPS',
        category: null,
      };
    } catch {
      // Fallback to searching by id
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    }
  }
}
