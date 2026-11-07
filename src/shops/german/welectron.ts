import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class WelectronShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'welectron',
    name: 'Welectron',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://www.welectron.com',
    shippingPolicy: {
      standardCarrier: 'DHL Paket',
      standardCost: 4.95,
      freeShippingThreshold: 99.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.welectron.com/Zahlung-und-Versand',
      notes: 'DPD Paket ab 4,95 € (frei ab 49 €). DHL Paket ab 4,95 € (frei ab 99 €). UPS Standard ab 5,95 €. DHL Express ab 19,90 €. 2% Skonto bei Vorkasse per Überweisung.',
      defaultMethodId: 'dhl',
      pickupAvailable: false,
      methods: [
        {
          id: 'dpd',
          name: 'DPD Paket',
          type: 'standard',
          carrier: 'DPD',
          cost: 4.95,
          freeShippingThreshold: 49.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand innerhalb Deutschlands (versandkostenfrei ab 49 €)',
        },
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL',
          cost: 4.95,
          freeShippingThreshold: 99.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand innerhalb Deutschlands (versandkostenfrei ab 99 €)',
        },
        {
          id: 'ups_standard',
          name: 'UPS Standard',
          type: 'standard',
          carrier: 'UPS',
          cost: 5.95,
          freeShippingThreshold: null,
          deliveryDays: '1-3 Werktage',
          notes: 'UPS Standardversand bis 30 kg',
        },
        {
          id: 'ups_express_saver',
          name: 'UPS Express Saver',
          type: 'express',
          carrier: 'UPS',
          cost: 9.9,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'UPS Express Saver bis 10 kg: 9,90 €; bis 30 kg: 19,90 €',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express',
          type: 'express',
          carrier: 'DHL Express',
          cost: 19.9,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'Expressversand bis 12 kg: 19,90 €; bis 30 kg: 29,90 €',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/search/?qs=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('#product-list .product-wrapper, .product-list .product-wrapper, .productbox').each((_, el) => {
        const $card = $(el);

        // Product title & URL
        const titleEl = $card.find('.productbox-title a').first();
        const title = titleEl.text().trim();
        const rawUrl = titleEl.attr('href') || $card.find('a[href]').first().attr('href') || '';
        if (!title || !rawUrl) {
          return;
        }

        const productUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

        // Identifier: prefer numeric JTL product ID, fallback to slug extracted from URL
        const idFromForm = $card.find('input[name="a"]').val()?.toString()?.trim();
        const idFromBtn = $card.find('button[data-product-id-cl]').attr('data-product-id-cl')?.trim();
        const idFromCollapse = $card.find('[data-target^="#variations-collapse-"]').attr('data-target')?.replace('#variations-collapse-', '').trim();
        const slugFromUrl = rawUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '').split(/[?#]/)[0];
        const id = idFromForm || idFromBtn || idFromCollapse || slugFromUrl;
        if (!id) {
          return;
        }

        // Avoid duplicate items from multiple selector matches
        if (items.some((item) => item.id === id)) {
          return;
        }

        // Price parsing
        const priceMeta = $card.find('meta[itemprop="price"]').attr('content');
        let price = priceMeta ? parseFloat(priceMeta) : null;
        if (price === null || isNaN(price)) {
          const priceText = $card.find('.productbox-price, .wel-price').text();
          price = parseEurPrice(priceText);
        }
        if (price === null || isNaN(price)) {
          return;
        }
        const unitPrice = roundEur(price);

        // Image
        const imageMeta = $card.find('meta[itemprop="image"]').attr('content');
        const imgElSrc = $card.find('.productbox-images img, .productbox-image img').attr('src');
        const rawImg = imageMeta || imgElSrc || null;
        const imageUrl = rawImg
          ? rawImg.startsWith('http')
            ? rawImg
            : `${this.metadata.baseUrl}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`
          : null;

        // Stock and availability
        const statusText = $card.find('.delivery-status, .status').text().trim();
        const inStock = statusText ? !statusText.toLowerCase().includes('nicht') && !statusText.toLowerCase().includes('out of stock') : true;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: null,
          sku: null,
          price: unitPrice,
          currency: 'EUR',
          formattedPrice: formatEur(unitPrice),
          inStock,
          stockDescription: statusText || 'Verfügbar',
          url: productUrl,
          imageUrl,
          shippingEstimate: `${this.metadata.shippingPolicy.standardCarrier} (${formatEur(this.metadata.shippingPolicy.standardCost)}, ${this.metadata.shippingPolicy.deliveryDays})`,
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
      // If numeric ID, try direct index.php?a=<id>, else try slug URL
      const isNumeric = /^\d+$/.test(id);
      const url = isNumeric
        ? `${this.metadata.baseUrl}/index.php?a=${encodeURIComponent(id)}`
        : `${this.metadata.baseUrl}/${encodeURIComponent(id)}`;

      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      // Verify it's a valid product page
      const title = $('h1.product-title, h1[itemprop="name"]').first().text().trim();
      if (!title || html.includes('diese Seite wurde leider nicht gefunden')) {
        // Fallback: search by ID
        const searchResults = await this.search(id, { limit: 1 });
        const matched = searchResults.find((item) => item.id === id);
        return matched ?? null;
      }

      // Price
      const priceMeta = $('meta[itemprop="price"]').attr('content');
      let price = priceMeta ? parseFloat(priceMeta) : null;
      if (price === null || isNaN(price)) {
        const priceText = $('.wel-price, .productbox-price').first().text();
        price = parseEurPrice(priceText);
      }
      if (price === null || isNaN(price)) {
        return null;
      }
      const unitPrice = roundEur(price);

      // SKU / Part Number
      const sku = $('.product-sku [itemprop="sku"]').text().trim() || null;
      const canonicalUrl = $('link[rel="canonical"]').attr('href') || url;

      // Image
      const imageMeta = $('meta[itemprop="image"]').attr('content');
      const imgSrc = $('.product-gallery img, .product-images img').first().attr('src');
      const rawImg = imageMeta || imgSrc || null;
      const imageUrl = rawImg
        ? rawImg.startsWith('http')
          ? rawImg
          : `${this.metadata.baseUrl}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`
        : null;

      // Stock
      const availabilityMeta = $('[itemprop="availability"]').attr('href') || '';
      const statusText = $('.delivery-status .status').text().trim() || $('.delivery-status').text().trim();
      const inStock = availabilityMeta.includes('InStock') || (statusText ? !statusText.toLowerCase().includes('nicht') : true);

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku,
        price: unitPrice,
        currency: 'EUR',
        formattedPrice: formatEur(unitPrice),
        inStock,
        stockDescription: statusText || (inStock ? 'Auf Lager' : 'Nicht lieferbar'),
        url: canonicalUrl,
        imageUrl,
        shippingEstimate: `${this.metadata.shippingPolicy.standardCarrier} (${formatEur(this.metadata.shippingPolicy.standardCost)}, ${this.metadata.shippingPolicy.deliveryDays})`,
        category: null,
      };
    } catch {
      return null;
    }
  }
}
