import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  body_html?: string;
  price?: number;
  featured_image?: string;
  variants?: Array<{
    id: number | string;
    price: number | string;
    sku?: string;
    available?: boolean | null;
  }>;
}

export class FunduinoShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'funduino',
    name: 'Funduino',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: [
      'de', 'at', 'be', 'bg', 'cy', 'cz', 'dk', 'ee', 'es', 'fi', 'fr', 'gr',
      'hr', 'hu', 'ie', 'it', 'lt', 'lu', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro',
      'se', 'si', 'sk', 'ch',
    ],
    baseUrl: 'https://funduino.com',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 4.90,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1-2 Werktage',
      policyUrl: 'https://funduino.com/policies/shipping-policy',
      notes: 'DHL Standardversand nach Deutschland für 4,90 €. Priorisierte Bearbeitung mit DHL für 6,90 €. 95,2 % der Inlandssendungen werden in max. 2 Werktagen zugestellt.',
      defaultMethodId: 'dhl-standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'dhl-standard',
          name: 'Deutschland – Standard (DHL)',
          type: 'standard',
          carrier: 'DHL Paket',
          cost: 4.90,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Standardversand innerhalb Deutschlands inklusive Sendungsverfolgung.',
        },
        {
          id: 'dhl-priority',
          name: 'Deutschland – priorisierte Bearbeitung (DHL)',
          type: 'express',
          carrier: 'DHL Paket',
          cost: 6.90,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Priorisierte Bearbeitung und Versand innerhalb Deutschlands mit DHL.',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/search?q=${encodeURIComponent(query)}&type=product`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('product-card').each((_, element) => {
        const card = $(element);
        const id = card.attr('data-product-id') || '';
        const linkEl = card.find('a.product-card__link').first();
        const rawHref = linkEl.attr('href') || card.find('a[href*="/products/"]').first().attr('href') || '';
        if (!rawHref) return;

        const cleanUrl = new URL(rawHref, this.metadata.baseUrl).href.split('?')[0];

        const title =
          card.find('[ref="productTitleLink"] p, h3').first().text().trim() ||
          linkEl.attr('aria-label')?.trim() ||
          '';
        if (!title) return;

        const priceText = card.find('[data-fu-preis-wert]').first().text().trim();
        const price = parseEurPrice(priceText) ?? 0;

        const lagerEl = card.find('.fu-lager');
        const lagerClass = lagerEl.attr('class') || '';
        const lagerText = card.find('.fu-lager__text').text().trim();

        // .fu-lager--in: Sofort versandfertig, .fu-lager--low: Nur noch X auf Lager
        const inStock = lagerClass.includes('fu-lager--in') || lagerClass.includes('fu-lager--low');
        const stockDescription = lagerText || (inStock ? 'Sofort versandfertig' : 'Nicht auf Lager');

        let imageUrl = card.find('img').first().attr('src') || card.attr('data-featured-media-url') || null;
        if (imageUrl) {
          if (imageUrl.startsWith('//')) {
            imageUrl = `https:${imageUrl}`;
          } else if (!imageUrl.startsWith('http')) {
            imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
          }
          imageUrl = imageUrl.split('&')[0];
        }

        const effectiveId = id || cleanUrl.split('/').pop() || query;

        items.push({
          id: effectiveId,
          slug: `${this.metadata.id}:${effectiveId}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: 'Funduino',
          sku: null,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription,
          url: cleanUrl,
          imageUrl,
          shippingEstimate: '1-2 Werktage',
          category: null,
        });
      });

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      // 1. If id is or looks like a handle, try fetching product JSON directly
      if (!/^\d+$/.test(id)) {
        const item = await this.fetchByHandle(id);
        if (item) return item;
      }

      // 2. Search for the ID or SKU via the search endpoint
      const searchResults = await this.search(id, { limit: 5 });
      const exact = searchResults.find(item => item.id === id);
      if (exact) return exact;
      if (searchResults.length > 0) return searchResults[0];

      return null;
    } catch {
      return null;
    }
  }

  private async fetchByHandle(handle: string): Promise<ComponentItem | null> {
    try {
      const url = `${this.metadata.baseUrl}/products/${encodeURIComponent(handle)}.js`;
      const data = await httpClient.fetchJson<ShopifyProduct>(url);
      if (!data || !data.title) return null;

      const rawPrice = typeof data.price === 'number' ? data.price / 100 : 0;
      const price = roundEur(rawPrice);
      const cleanUrl = `${this.metadata.baseUrl}/products/${data.handle}`;
      let imageUrl = data.featured_image || null;
      if (imageUrl?.startsWith('//')) {
        imageUrl = `https:${imageUrl}`;
      }

      const available = data.variants?.some(v => v.available) ?? true;
      const sku = data.variants?.[0]?.sku || null;
      const strId = String(data.id);

      return {
        id: strId,
        slug: `${this.metadata.id}:${strId}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title: data.title,
        brand: 'Funduino',
        sku,
        price,
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock: available,
        stockDescription: available ? 'Sofort versandfertig' : 'Nicht auf Lager',
        url: cleanUrl,
        imageUrl,
        shippingEstimate: '1-2 Werktage',
        category: null,
      };
    } catch {
      return null;
    }
  }
}
