import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class AntratekShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'antratek',
    name: 'Antratek Deutschland',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'nl', 'be', 'eu'],
    baseUrl: 'https://www.antratek.de',
    shippingPolicy: {
      standardCarrier: 'DPD / PostNL',
      standardCost: 7.08,
      freeShippingThreshold: 119.0,
      currency: 'EUR',
      deliveryDays: '1–2 Werktage',
      policyUrl: 'https://www.antratek.de/bestellinformationen#Versandinformationen',
      notes: 'DPD / PostNL: 7,08 € brutto (versandkostenfrei ab 119,00 € brutto). Gleichtägige Bearbeitung vor 17:00 Uhr.',
      defaultMethodId: 'dpd',
      pickupAvailable: false,
      methods: [
        {
          id: 'dpd',
          name: 'DPD / PostNL Standard',
          type: 'standard',
          carrier: 'DPD / PostNL',
          cost: 7.08,
          freeShippingThreshold: 119.0,
          deliveryDays: '1–2 Werktage',
          notes: 'Standardversand DPD / PostNL',
        },
        {
          id: 'ups_express',
          name: 'UPS Express',
          type: 'express',
          carrier: 'UPS Express',
          cost: 14.28,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'UPS Express Zustellung am nächsten Werktag',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const url = `${this.metadata.baseUrl}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(url);
    const $ = httpClient.loadCheerio(html);

    const items: ComponentItem[] = [];

    $('.product-item').each((_, element) => {
      const itemEl = $(element);
      const linkEl = itemEl.find('.product-item-link').first();
      const title = linkEl.text().trim();
      if (!title) return;

      const rawUrl = linkEl.attr('href') || '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

      // ID: data attribute, or URL path without leading/trailing slashes
      const dataId = itemEl.find('[data-product-id]').attr('data-product-id') || itemEl.attr('data-product-id');
      const urlMatch = fullUrl.replace(this.metadata.baseUrl, '').replace(/^\/|\/$/g, '');
      const id = dataId || urlMatch || title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);

      // Price: in Magento, final price is often in .price-final_price .price or .price
      const rawPriceText = itemEl.find('.price-final_price .price, .normal-price .price, .price').first().text();
      const price = parseEurPrice(rawPriceText) ?? 0;

      const imgEl = itemEl.find('img.product-image-photo, img').first();
      const imageUrl = imgEl.attr('src') || null;

      const stockEl = itemEl.find('.stock');
      const stockText = stockEl.text().trim().toLowerCase();
      const inStock = !stockEl.hasClass('unavailable') && !stockText.includes('nicht vorrätig');

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
        stockDescription: stockText || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
        url: fullUrl,
        imageUrl,
        shippingEstimate: '1–2 Werktage',
        category: null,
      });
    });

    return this.applyOptions(items, options);
  }

  async getById(id: string): Promise<ComponentItem | null> {
    // If id looks like a URL slug, fetch directly; otherwise search
    const path = id.startsWith('http') ? id : `${this.metadata.baseUrl}/${id.replace(/^\//, '')}`;
    try {
      const html = await httpClient.fetchHtml(path);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1.page-title, h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      const rawPrice = $('.price-final_price .price, .price').first().text();
      const price = parseEurPrice(rawPrice) ?? 0;

      const sku = $('[itemprop="sku"]').text().trim() || null;
      const stockEl = $('.stock');
      const inStock = !stockEl.hasClass('unavailable');

      const imgEl = $('.gallery-placeholder img, img.fotorama__img, .product.media img').first();
      const imageUrl = imgEl.attr('src') || null;

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: inStock ? 'Auf Lager' : 'Nicht auf Lager',
        url: path,
        imageUrl,
        shippingEstimate: '1–2 Werktage',
        category: null,
      };
    } catch {
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    }
  }
}
