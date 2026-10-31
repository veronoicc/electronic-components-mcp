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

export class BerrybaseShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'berrybase',
    name: 'BerryBase',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.berrybase.de',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 4.95,
      freeShippingThreshold: 200.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.berrybase.de/versand-und-zahlungsbedingungen',
      notes: 'DHL Paket: 4,95 € (versandkostenfrei ab 200,00 €). UPS Standard: 5,90 € (frei ab 250,00 €). Kostenlose Selbstabholung im MakerSpace Berlin-Adlershof.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'BerryBase MakerSpace Berlin-Adlershof',
        address: 'Am Studio 20d',
        city: 'Berlin',
        postalCode: '12489',
        country: 'DE',
        openingHours: 'Mo-Do 11:00-18:00 Uhr, Fr 11:00-17:00 Uhr',
        instructions: 'Kostenlose Abholung nach Bereitstellungsbenachrichtigung per E-Mail im MakerSpace Berlin-Adlershof.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL Paket',
          cost: 4.95,
          freeShippingThreshold: 200.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand mit DHL Paket',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung BerryBase MakerSpace Berlin-Adlershof',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Sofort abholbereit nach Bereitstellung',
          pickupLocation: {
            name: 'BerryBase MakerSpace Berlin-Adlershof',
            address: 'Am Studio 20d',
            city: 'Berlin',
            postalCode: '12489',
            country: 'DE',
            openingHours: 'Mo-Do 11:00-18:00 Uhr, Fr 11:00-17:00 Uhr',
            instructions: 'Kostenlose Abholung nach Bereitstellungsbenachrichtigung per E-Mail im MakerSpace Berlin-Adlershof.',
          },
          notes: 'Kostenlose Selbstabholung im MakerSpace Berlin-Adlershof',
        },
        {
          id: 'ups_standard',
          name: 'UPS Standard',
          type: 'standard',
          carrier: 'UPS',
          cost: 5.9,
          freeShippingThreshold: 250.0,
          deliveryDays: '1-2 Werktage',
          notes: 'UPS Standardversand (versandkostenfrei ab 250,00 €)',
        },
        {
          id: 'ups_express',
          name: 'UPS Express Saver',
          type: 'express',
          carrier: 'UPS Express',
          cost: 9.9,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'UPS Express Saver garantierte Zustellung am nächsten Werktag',
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
          // ignore parsing error, will use DOM fallback
        }
      }

      const titleLink = box.find('a.product-title, .product-image-link, a').first();
      const rawUrl = titleLink.attr('href') || '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

      const title = info.name || box.find('.product-title, .product-name').first().text().trim();
      if (!title) return;

      const id =
        info.id ||
        (fullUrl.match(/\/detail\/([a-zA-Z0-9]+)/) || [])[1] ||
        info.sku ||
        title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);

      let price = info.price !== undefined ? roundEur(info.price) : 0;
      if (!price) {
        const rawPriceText = box.find('.product-price, .price-unit').first().text();
        price = parseEurPrice(rawPriceText) ?? 0;
      }

      const imgEl = box.find('img').first();
      let imageUrl = imgEl.attr('src') || imgEl.attr('srcset') || null;
      if (imageUrl && imageUrl.includes(',')) {
        imageUrl = imageUrl.split(',')[0].trim().split(' ')[0];
      }

      const deliveryText = box.find('.delivery-status-indicator, .product-delivery-information').text().toLowerCase();
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
      if (!title) return null;

      const rawPrice = $('.product-detail-price, .price-unit').first().text();
      const price = parseEurPrice(rawPrice) ?? 0;

      const sku = $('.product-detail-ordernumber, [itemprop="sku"]').first().text().trim() || null;
      const brand = $('.product-detail-manufacturer, [itemprop="brand"]').first().text().trim() || null;

      const deliveryText = $('.delivery-status-indicator, .product-detail-delivery-information').text().toLowerCase();
      const inStock = !deliveryText.includes('nicht lieferbar');

      const imgEl = $('.gallery-slider-item img, .product-image-container img').first();
      const imageUrl = imgEl.attr('src') || null;

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
