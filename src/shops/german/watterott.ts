import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class WatterottShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'watterott',
    name: 'Watterott electronic',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://shop.watterott.com',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 4.5,
      freeShippingThreshold: 100.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://shop.watterott.com/Zahlung-Versand',
      notes: 'DHL Paket: 4,50 € (versandkostenfrei ab 100,00 € in DE). Kostenlose Selbstabholung in Leinefelde-Worbis.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Watterott electronic GmbH',
        address: 'Breitenhölzer Str. 6',
        city: 'Leinefelde-Worbis',
        postalCode: '37327',
        country: 'DE',
        openingHours: 'Mo-Fr 09:00-15:00 Uhr',
        instructions: 'Kostenlose Abholung nach Bereitstellungsbestätigung per E-Mail.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL',
          cost: 4.5,
          freeShippingThreshold: 100.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standard DHL Paketversand (versandkostenfrei ab 100,00 €)',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung Leinefelde-Worbis',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Bereit zur Abholung',
          pickupLocation: {
            name: 'Watterott electronic GmbH',
            address: 'Breitenhölzer Str. 6',
            city: 'Leinefelde-Worbis',
            postalCode: '37327',
            country: 'DE',
            openingHours: 'Mo-Fr 09:00-15:00 Uhr',
            instructions: 'Kostenlose Abholung nach Bereitstellungsbestätigung per E-Mail.',
          },
          notes: 'Kostenlose Selbstabholung am Hauptstandort',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express',
          type: 'express',
          carrier: 'DHL Express',
          cost: 12.5,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'DHL Express Zustellung am nächsten Werktag',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const url = `${this.metadata.baseUrl}/index.php?k=0&q=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(url);
    const $ = httpClient.loadCheerio(html);

    const items: ComponentItem[] = [];

    $('.product-wrapper').each((_, element) => {
      const card = $(element);
      const linkEl = card.find('a').first();
      let rawUrl = linkEl.attr('href') || '';
      if (!rawUrl) return;

      if (!rawUrl.startsWith('http')) {
        rawUrl = `${this.metadata.baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      }

      const title =
        card.find('.productbox-title, .title, a').first().text().trim() ||
        linkEl.attr('title')?.trim() ||
        '';

      if (!title || title.length < 2) return;

      const imgEl = card.find('img').first();
      let id = (imgEl.attr('src')?.match(/\/product\/(\d+)\//) || [])[1];
      if (!id) {
        id = rawUrl.replace(this.metadata.baseUrl, '').replace(/^\/|\/$/g, '').slice(0, 36);
      }

      const rawPrice = card.find('.price_wrapper, .price, [class*="price"]').first().text();
      const price = parseEurPrice(rawPrice) ?? 0;

      let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }

      const deliveryText = card.find('.delivery-status, .status, [class*="avail"]').text().toLowerCase();
      const inStock = !deliveryText.includes('nicht lieferbar') && !deliveryText.includes('ausverkauft');

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
        stockDescription: deliveryText.trim() || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
        url: rawUrl,
        imageUrl,
        shippingEstimate: '1-3 Werktage',
        category: null,
      });
    });

    return this.applyOptions(items, options);
  }

  async getById(id: string): Promise<ComponentItem | null> {
    const searchResults = await this.search(id, { limit: 1 });
    return searchResults[0] ?? null;
  }
}
