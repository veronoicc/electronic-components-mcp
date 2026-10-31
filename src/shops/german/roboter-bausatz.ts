import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface ShopwareProductInfo {
  id?: string;
  name?: string;
  brand?: string;
  price?: number;
  sku?: string;
}

export class RoboterBausatzShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'roboter-bausatz',
    name: 'Roboter-Bausatz',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://www.roboter-bausatz.de',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 4.45,
      freeShippingThreshold: 99.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.roboter-bausatz.de/c/information/versand-und-zahlung',
      notes: 'DHL Paket: 4,45 € (versandkostenfrei ab 99,00 €). Versand am gleichen Tag bei Zahlung bis 12:00 Uhr. Selbstabholung im Lager Saarbrücken möglich.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Roboter-Bausatz.de by anzado GmbH',
        address: 'Römerstadt 2-4',
        city: 'Saarbrücken',
        postalCode: '66121',
        country: 'DE',
        openingHours: 'Di-Do 09:00-12:00 & 14:00-16:00 Uhr, Fr 09:00-12:00 & 13:00-15:00 Uhr',
        instructions: 'Vorab im Onlineshop bestellen und bezahlen. Bei Abholung im Lager Saarbrücken klingeln und Bestellnummer/Nachnamen nennen.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL Paket',
          cost: 4.45,
          freeShippingThreshold: 99.0,
          deliveryDays: '1-3 Werktage',
          notes: 'DHL Paketversand',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung Lager Saarbrücken',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Bereit zur Abholung',
          pickupLocation: {
            name: 'Roboter-Bausatz.de by anzado GmbH',
            address: 'Römerstadt 2-4',
            city: 'Saarbrücken',
            postalCode: '66121',
            country: 'DE',
            openingHours: 'Di-Do 09:00-12:00 & 14:00-16:00 Uhr, Fr 09:00-12:00 & 13:00-15:00 Uhr',
            instructions: 'Vorab im Onlineshop bestellen und bezahlen. Bei Abholung im Lager Saarbrücken klingeln und Bestellnummer/Nachnamen nennen.',
          },
          notes: 'Kostenlose Abholung am Lagerstandort Saarbrücken',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express',
          type: 'express',
          carrier: 'DHL Express',
          cost: 11.9,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'DHL Expressversand mit garantierter Zustellung am nächsten Werktag',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const url = `${this.metadata.baseUrl}/search?search=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(url);
    const $ = httpClient.loadCheerio(html);

    const items: ComponentItem[] = [];

    $('.product-box').each((_, element) => {
      const box = $(element);
      const dataAttr = box.attr('data-product-information');
      let info: ShopwareProductInfo = {};

      if (dataAttr) {
        try {
          info = JSON.parse(dataAttr);
        } catch {
          // ignore parsing error
        }
      }

      const titleLink = box.find('a.product-title, .product-image-link, a').first();
      const rawUrl = titleLink.attr('href') || '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

      const title = info.name || box.find('.product-title, .product-name, .title').first().text().trim();
      if (!title) return;

      const id =
        info.id ||
        info.sku ||
        (fullUrl.match(/\/p\/([a-zA-Z0-9_-]+)/) || [])[1] ||
        title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);

      let price = info.price !== undefined ? roundEur(info.price) : 0;
      if (!price) {
        const rawPriceText = box.find('.product-price, .price').first().text();
        price = parseEurPrice(rawPriceText) ?? 0;
      }

      const imgEl = box.find('img').first();
      let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${this.metadata.baseUrl}${imageUrl}`;
      }

      const deliveryText = box.find('.delivery-status-indicator, .status, .delivery-status').text().toLowerCase();
      const inStock =
        deliveryText.includes('sofort') ||
        deliveryText.includes('lager') ||
        deliveryText.includes('lieferbar') ||
        !deliveryText.includes('nicht lieferbar');

      items.push({
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: info.brand || null,
        sku: info.sku || null,
        price,
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: deliveryText.trim() || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
        url: fullUrl,
        imageUrl,
        shippingEstimate: '1-3 Werktage',
        category: null,
      });
    });

    return this.applyOptions(items, options);
  }

  async getById(id: string): Promise<ComponentItem | null> {
    const detailUrl = `${this.metadata.baseUrl}/detail/${encodeURIComponent(id)}`;
    try {
      const html = await httpClient.fetchHtml(detailUrl);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1.product-detail-name, h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      const rawPrice = $('.product-detail-price, .price').first().text();
      const price = parseEurPrice(rawPrice) ?? 0;

      const sku = $('.product-detail-ordernumber, [itemprop="sku"]').first().text().trim() || null;
      const brand = $('.product-detail-manufacturer, [itemprop="brand"]').first().text().trim() || null;

      const deliveryText = $('.delivery-status-indicator, .product-detail-delivery-information').text().toLowerCase();
      const inStock = !deliveryText.includes('nicht lieferbar');

      const imgEl = $('.gallery-slider-item img, .product-image-container img').first();
      let imageUrl = imgEl.attr('src') || null;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${this.metadata.baseUrl}${imageUrl}`;
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
        stockDescription: deliveryText.trim() || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
        url: detailUrl,
        imageUrl,
        shippingEstimate: '1-3 Werktage',
        category: null,
      };
    } catch {
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    }
  }
}
