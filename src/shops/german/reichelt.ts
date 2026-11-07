import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class ReicheltShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'reichelt',
    name: 'Reichelt Elektronik',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.reichelt.de',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 5.95,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1-2 Werktage',
      policyUrl: 'https://www.reichelt.de/de/de/shop/service/-12_28',
      notes:
        'Standardversand DHL bis 10 kg: 5,95 €. DPD bis 10 kg: 7,95 €. DHL Nachnahme bis 10 kg: 9,95 €. Vor-Ort-Abholung im Ladengeschäft Sande kostenlos.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'reichelt elektronik Ladengeschäft',
        address: 'Elektronikring 1',
        city: 'Sande',
        postalCode: '26452',
        country: 'Deutschland',
        openingHours: 'Mo. - Do.: 12:30 - 16:30 Uhr, Fr.: 12:30 - 14:00 Uhr',
        instructions: 'Direkte Abholung vor Ort im Elektronikring 1, 26452 Sande.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket (bis 10 kg)',
          type: 'standard',
          carrier: 'DHL',
          cost: 5.95,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Standardversand innerhalb Deutschlands (bis 10 kg: 5,95 €).',
        },
        {
          id: 'dpd',
          name: 'DPD (bis 10 kg)',
          type: 'standard',
          carrier: 'DPD',
          cost: 7.95,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'DPD Paketversand (bis 10 kg: 7,95 €).',
        },
        {
          id: 'dhl_cod',
          name: 'DHL Nachnahme (bis 10 kg)',
          type: 'standard',
          carrier: 'DHL',
          cost: 9.95,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Zahlung per Nachnahme bei Zustellung.',
        },
        {
          id: 'pickup_sande',
          name: 'Selbstabholung (Sande)',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Sofort während Öffnungszeiten',
          notes: 'Kostenlose Abholung im Ladengeschäft Sande.',
          pickupLocation: {
            name: 'reichelt elektronik Ladengeschäft',
            address: 'Elektronikring 1',
            city: 'Sande',
            postalCode: '26452',
            country: 'Deutschland',
            openingHours: 'Mo. - Do.: 12:30 - 16:30 Uhr, Fr.: 12:30 - 14:00 Uhr',
            instructions: 'Direkte Abholung vor Ort im Elektronikring 1, 26452 Sande.',
          },
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/de/de/index.html?ACTION=446&SEARCH=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('.al_gallery_article').each((_, element) => {
        const card = $(element);

        // Product Link
        const linkEl = card.find('a[href*="/produkt/"], a.al_artinfo_link').first();
        let rawUrl = linkEl.attr('href') || '';
        if (!rawUrl) return;
        if (!rawUrl.startsWith('http')) {
          rawUrl = `${this.metadata.baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
        }

        // Title and ID
        const metaName = card.find('meta[itemprop="name"]').attr('content')?.trim();
        const metaPid = card.find('meta[itemprop="productID"]').attr('content')?.trim();
        const title =
          metaName ||
          card.find('a.al_artinfo_link').text().trim() ||
          linkEl.attr('title')?.trim() ||
          '';

        if (!title || title.length < 2) return;

        const urlIdMatch = rawUrl.match(/-(\d+)(?:\?|$)/);
        const id = urlIdMatch?.[1] || metaPid || '';
        if (!id) return;

        // Price
        const priceEl = card.find('.productPrice, .al_artlinks_price').first();
        const rawPrice = priceEl.text().trim();
        const price = parseEurPrice(rawPrice) ?? 0;

        // Image
        const imgEl = card.find('img[itemprop="image"]').length ? card.find('img[itemprop="image"]') : card.find('picture img, img').first();
        let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
        }

        // Stock & Availability
        const deliveryTextRaw = card
          .find('.al_artinfo_delivery, [class*="delivery"], [class*="avail"], [class*="lager"]')
          .text()
          .trim();
        const deliveryLower = deliveryTextRaw.toLowerCase();
        const inStock =
          deliveryLower.includes('lager') ||
          (deliveryLower.includes('lieferbar') &&
            !deliveryLower.includes('nicht lieferbar') &&
            !deliveryLower.includes('voraussichtlich'));

        const stockDescription = deliveryTextRaw.replace(/\s+/g, ' ') || (inStock ? 'Auf Lager' : 'Nicht auf Lager');

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: card.find('meta[itemprop="sku"]').attr('content')?.trim() || null,
          sku: metaPid || null,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription: stockDescription || null,
          url: rawUrl,
          imageUrl,
          shippingEstimate: `${this.metadata.shippingPolicy.deliveryDays} (${formatEur(this.metadata.shippingPolicy.standardCost)})`,
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
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    } catch {
      return null;
    }
  }
}
