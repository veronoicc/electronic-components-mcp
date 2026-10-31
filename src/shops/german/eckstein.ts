import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class EcksteinShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'eckstein',
    name: 'Eckstein Komponente',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://eckstein-shop.de',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 6.5,
      freeShippingThreshold: 200.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://eckstein-shop.de/Versandinformationen',
      notes: 'DHL / DPD Paket: 6,50 € (versandkostenfrei ab 200,00 €). Warenpost ab 2,60 €. Kostenlose Selbstabholung in Clausthal-Zellerfeld.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Eckstein GmbH',
        address: 'Am Ostbahnhof 3',
        city: 'Clausthal-Zellerfeld',
        postalCode: '38678',
        country: 'DE',
        openingHours: 'Mo-Fr 09:00-16:00 Uhr',
        instructions: 'Kostenlose Abholung nach Auswahl im Checkout und Erhalt der Abholbestätigung per E-Mail.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL',
          cost: 6.5,
          freeShippingThreshold: 200.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand mit DHL Paket (versichert bis 500 €)',
        },
        {
          id: 'dpd',
          name: 'DPD Paket',
          type: 'standard',
          carrier: 'DPD',
          cost: 6.5,
          freeShippingThreshold: 200.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand mit DPD Paket',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung Clausthal-Zellerfeld',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Sofort abholbereit nach Bereitstellung',
          pickupLocation: {
            name: 'Eckstein GmbH',
            address: 'Am Ostbahnhof 3',
            city: 'Clausthal-Zellerfeld',
            postalCode: '38678',
            country: 'DE',
            openingHours: 'Mo-Fr 09:00-16:00 Uhr',
            instructions: 'Kostenlose Abholung nach Auswahl im Checkout und Erhalt der Abholbestätigung per E-Mail.',
          },
          notes: 'Kostenlose Selbstabholung am Standort Clausthal-Zellerfeld',
        },
        {
          id: 'warenpost',
          name: 'Warenpost / Briefversand',
          type: 'economy',
          carrier: 'Deutsche Post',
          cost: 2.6,
          freeShippingThreshold: null,
          deliveryDays: '2-4 Werktage',
          notes: 'Kompakter Brief- und Warenpostversand für Kleinteile',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const url = `${this.metadata.baseUrl}/?suche=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(url);
    const $ = httpClient.loadCheerio(html);

    const items: ComponentItem[] = [];

    $('.productbox').each((_, element) => {
      const card = $(element);

      // Link: data-href on .slpx-product-link or a.productbox-title or a
      const linkEl = card.find('.slpx-product-link[data-href], a.productbox-title, a[href*="-"]').first();
      let rawUrl = linkEl.attr('data-href') || linkEl.attr('href') || '';
      if (!rawUrl) return;
      if (!rawUrl.startsWith('http')) {
        rawUrl = `${this.metadata.baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      }

      // Title: link text or img alt
      const imgEl = card.find('img').first();
      let title =
        card.find('a.productbox-title, .productbox-title, .title').first().text().trim() ||
        imgEl.attr('alt')?.trim() ||
        linkEl.text().trim();

      if (!title || title.length < 2) return;

      // ID: image path /product/(\d+)/ or URL slug
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

      const deliveryText = card.find('.delivery-status, [class*="delivery"], .status').text().toLowerCase();
      const inStock =
        deliveryText.includes('lieferbar') ||
        deliveryText.includes('auf lager') ||
        !deliveryText.includes('nicht lieferbar');

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
