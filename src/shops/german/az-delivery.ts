import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class AzDeliveryShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'az-delivery',
    name: 'AZ-Delivery',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://www.az-delivery.de',
    shippingPolicy: {
      standardCarrier: 'DHL / Deutsche Post',
      standardCost: 3.9,
      freeShippingThreshold: 25.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.az-delivery.de/policies/shipping-policy',
      notes: 'Standardversand 3,90 € (versandkostenfrei ab 25,00 € in DE und EU). Expressversand mit DHL Express 5,90 € (2,00 € ab 25,00 €).',
      defaultMethodId: 'dhl',
      pickupAvailable: false,
      methods: [
        {
          id: 'dhl',
          name: 'DHL / Deutsche Post Standard',
          type: 'standard',
          carrier: 'DHL / Deutsche Post',
          cost: 3.9,
          freeShippingThreshold: 25.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand per Deutsche Post / DHL (kostenfrei ab 25 €)',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express',
          type: 'express',
          carrier: 'DHL Express',
          cost: 5.9,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'Expressversand mit Zustellung am nächsten Werktag',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/search?type=product&q=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('.product-item').each((_, element) => {
        const itemEl = $(element);
        const linkEl = itemEl.find('.product-item__title').first();
        const title = linkEl.text().trim();
        if (!title) return;

        const rawUrl = linkEl.attr('href') || '';
        const cleanPath = rawUrl.split('?')[0];
        const productUrl = cleanPath.startsWith('http')
          ? cleanPath
          : `${this.metadata.baseUrl}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;

        const handle = cleanPath.replace(/^\/products\//, '').replace(/\/$/, '');
        const idAttr = itemEl.find('input[name="product-id"]').val() ||
          itemEl.find('ryviu-widget-total').attr('product_id') ||
          itemEl.find('input[name="id"]').val();
        const id = (typeof idAttr === 'string' && idAttr.trim()) ? idAttr.trim() : handle;

        const priceEl = itemEl.find('.price--highlight, .price').first();
        const rawPriceText = priceEl.clone().children('.visually-hidden').remove().end().text().trim();
        const price = parseEurPrice(rawPriceText) ?? 0;

        const imgEl = itemEl.find('img.product-item__primary-image, .product-item__image-wrapper img').first();
        let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || undefined;
        if (imageUrl?.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        const invText = itemEl.find('.product-item__inventory').text().trim().toLowerCase();
        const isSoldOut = invText.includes('ausverkauft') || invText.includes('nicht auf lager');
        const inStock = !isSoldOut;
        const stockDescription = itemEl.find('.product-item__inventory').text().trim() ||
          (inStock ? 'Auf Lager' : 'Ausverkauft');

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
          stockDescription,
          url: productUrl,
          imageUrl: imageUrl || null,
          shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
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
      // id can be a Shopify numeric ID or product handle slug
      const isNumeric = /^\d+$/.test(id);
      const query = isNumeric ? `id:${id}` : id;
      const results = await this.search(query);
      const directMatch = results.find(
        (item) => item.id === id || item.url.endsWith(`/products/${id}`),
      );
      return directMatch || results[0] || null;
    } catch {
      return null;
    }
  }
}
