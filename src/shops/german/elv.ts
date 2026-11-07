import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class ElvShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'elv',
    name: 'ELV Elektronik',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://de.elv.com',
    shippingPolicy: {
      standardCarrier: 'DHL / GLS',
      standardCost: 3.99,
      freeShippingThreshold: 39.0,
      currency: 'EUR',
      deliveryDays: '1-2 Werktage',
      policyUrl: 'https://de.elv.com/service-bereich/versand-kosten/',
      notes: 'DHL / GLS Standardversand: 3,99 € (versandkostenfrei ab 39,00 € Warenwert innerhalb Deutschlands).',
      defaultMethodId: 'standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'standard',
          name: 'Standardversand (DHL / GLS)',
          type: 'standard',
          carrier: 'DHL / GLS',
          cost: 3.99,
          freeShippingThreshold: 39.0,
          deliveryDays: '1-2 Werktage',
          notes: 'Standardlieferung innerhalb Deutschlands, versandkostenfrei ab 39 € Warenwert',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/search?q=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);
      const items: ComponentItem[] = [];

      $('.product-tile').each((_, el) => {
        const tile = $(el);

        const linkEl = tile.find('a.product-tile__title-link, a.product-tile__image-wrap, a[href*="/p/"]').first();
        const href = linkEl.attr('href') || '';
        if (!href) return;

        const idMatch = href.match(/itemId=(\d+)/) || href.match(/-P(\d+)/) || href.match(/\/p\/.*?P?(\d+)/);
        const id = idMatch ? idMatch[1] : '';
        if (!id) return;

        const title = tile.find('.product-tile__title, .product-tile__title-link').first().text().trim() ||
          linkEl.attr('title')?.trim() || '';
        if (!title) return;

        const priceText = tile.find('.pricebox-prices--price').first().text().trim();
        const parsedPrice = parseEurPrice(priceText);
        const isFree = tile.find('.product-price-with-energy-label__free-article, .product-actions__read-more').length > 0;
        const price = parsedPrice ?? (isFree ? 0 : 0);

        const shipText = tile.find('.shipment').first().text().replace(/\s+/g, ' ').trim();
        const lowerShip = shipText.toLowerCase();
        const inStock = lowerShip.includes('sofort') || lowerShip.includes('download') || lowerShip.includes('lieferzeit: 1-2') || (!lowerShip.includes('nicht lieferbar') && !lowerShip.includes('vergriffen'));

        let deliveryDays = '1-2 Werktage';
        const daysMatch = shipText.match(/(\d+[-–]\d+\s*Werktage)/i);
        if (daysMatch) {
          deliveryDays = daysMatch[1];
        }

        const imgEl = tile.find('img.image__media, img').first();
        let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        const absoluteUrl = href.startsWith('http') ? href : `${this.metadata.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: title.startsWith('ELV ') ? 'ELV' : null,
          sku: id,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription: shipText || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
          url: absoluteUrl,
          imageUrl,
          shippingEstimate: deliveryDays,
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
      // Direct URL pattern works with P<id>
      const cleanId = id.replace(/^P/i, '');
      const detailUrl = `${this.metadata.baseUrl}/p/P${cleanId}`;
      const html = await httpClient.fetchHtml(detailUrl);
      const $ = httpClient.loadCheerio(html);

      let name = '';
      let price = 0;
      let inStock = true;
      let imageUrl: string | null = null;
      let sku = cleanId;

      // Extract JSON-LD product structured data if available
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const content = $(el).contents().text();
          const data = JSON.parse(content);
          if (data['@type'] === 'Product') {
            name = data.name || name;
            sku = data.sku || sku;
            if (data.image) {
              imageUrl = typeof data.image === 'string' ? data.image : (data.image.url?.[0] || null);
            }
            const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
            if (offer) {
              const offerPrice = parseFloat(offer.price);
              if (!Number.isNaN(offerPrice)) {
                price = offerPrice;
              }
              if (offer.availability) {
                inStock = String(offer.availability).toLowerCase().includes('instock');
              }
            }
          }
        } catch {
          // ignore parsing error
        }
      });

      if (!name) {
        name = $('meta[property="og:title"]').attr('content')?.split('|')[0]?.trim() ||
          $('title').text().split('|')[0]?.trim() || '';
      }
      if (!name) return null;

      if (price === 0) {
        const priceText = $('.pricebox-prices--price').first().text().trim();
        const parsed = parseEurPrice(priceText);
        if (parsed !== null) {
          price = parsed;
        }
      }

      if (!imageUrl) {
        imageUrl = $('meta[property="og:image"]').attr('content') || null;
      }

      const shipText = $('.shipment').first().text().replace(/\s+/g, ' ').trim();
      let deliveryDays = '1-2 Werktage';
      const daysMatch = shipText.match(/(\d+[-–]\d+\s*Werktage)/i);
      if (daysMatch) {
        deliveryDays = daysMatch[1];
      }

      return {
        id: cleanId,
        slug: `${this.metadata.id}:${cleanId}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title: name,
        brand: name.startsWith('ELV ') ? 'ELV' : null,
        sku,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: shipText || (inStock ? 'Auf Lager' : 'Nicht auf Lager'),
        url: detailUrl,
        imageUrl,
        shippingEstimate: deliveryDays,
        category: null,
      };
    } catch {
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    }
  }
}
