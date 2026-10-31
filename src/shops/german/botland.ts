import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class BotlandShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'botland',
    name: 'Botland',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'pl', 'eu'],
    baseUrl: 'https://botland.de',
    shippingPolicy: {
      standardCarrier: 'GLS / DHL / Hermes Kurier',
      standardCost: 4.99,
      freeShippingThreshold: 100.0,
      currency: 'EUR',
      deliveryDays: '2–3 Werktage',
      policyUrl: 'https://botland.de/content/1-lieferung-und-bezahlung',
      notes: 'GLS / DHL / Hermes: 4,99 € (versandkostenfrei ab 100,00 €). Gleichtägiger Versand vor 14:00 Uhr (Di–Fr) bzw. 13:00 Uhr (Mo).',
      defaultMethodId: 'gls',
      pickupAvailable: false,
      methods: [
        {
          id: 'gls',
          name: 'GLS Kurier',
          type: 'standard',
          carrier: 'GLS Kurier',
          cost: 4.99,
          freeShippingThreshold: 100.0,
          deliveryDays: '2–3 Werktage',
          notes: 'Standardzustellung mit GLS Kurier',
        },
        {
          id: 'dhl',
          name: 'DHL Kurier',
          type: 'standard',
          carrier: 'DHL Kurier',
          cost: 5.99,
          freeShippingThreshold: 120.0,
          deliveryDays: '2–3 Werktage',
          notes: 'DHL Kurierzustellung',
        },
        {
          id: 'hermes',
          name: 'Hermes Paket',
          type: 'economy',
          carrier: 'Hermes',
          cost: 4.49,
          freeShippingThreshold: null,
          deliveryDays: '2–4 Werktage',
          notes: 'Günstiger Paketversand mit Hermes',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const url = `${this.metadata.baseUrl}/suche?s=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(url);
    const $ = httpClient.loadCheerio(html);

    const items: ComponentItem[] = [];

    $('.product-miniature').each((_, element) => {
      const card = $(element);
      const titleEl = card.find('.product-miniature__title, .product-title, h2, h3, a').first();
      const title = titleEl.text().trim();
      if (!title) return;

      const linkEl = card.find('a').first();
      const rawUrl = linkEl.attr('href') || '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

      const id =
        card.attr('data-id-product') ||
        (fullUrl.match(/\/(\d+)-[a-zA-Z0-9_-]+\.html/) || [])[1] ||
        title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);

      const rawPriceText = card
        .find('.js-edge-product-price-final, .product-miniature__prices-current, .price')
        .first()
        .text();
      const price = parseEurPrice(rawPriceText) ?? 0;

      const imgEl = card.find('img').first();
      const imageUrl = imgEl.attr('src') || imgEl.attr('data-full-size-image-url') || null;

      const inStock =
        card.find('.product-miniature__availability--in-stock').length > 0 ||
        !card.find('.product-miniature__availability--out-of-stock').length;

      items.push({
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku: null,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: inStock ? 'Auf Lager' : 'Nicht auf Lager',
        url: fullUrl,
        imageUrl,
        shippingEstimate: '2–3 Werktage',
        category: null,
      });
    });

    return this.applyOptions(items, options);
  }

  async getById(id: string): Promise<ComponentItem | null> {
    // If id is numeric product ID, search for it
    const searchResults = await this.search(id, { limit: 1 });
    return searchResults[0] ?? null;
  }
}
