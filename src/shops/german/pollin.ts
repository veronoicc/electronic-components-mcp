import type { CheerioAPI } from 'cheerio';
import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface PollinProductInfo {
  id?: string;
  name?: string;
  brand?: string;
  price?: number;
  sku?: string;
}

export class PollinShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'pollin',
    name: 'Pollin Electronic',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at'],
    baseUrl: 'https://www.pollin.de',
    shippingPolicy: {
      standardCarrier: 'DHL',
      standardCost: 5.99,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.pollin.de/versand-bezahlen',
      notes:
        'Standardversand mit DHL: 5,99 € (nach Österreich: 6,99 €). Kostenlose Selbstabholung im Pollin Electronic Center Pförring.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Pollin Electronic Center Pförring',
        address: 'Max-Pollin-Straße 1',
        city: 'Pförring',
        postalCode: '85104',
        country: 'DE',
        openingHours: 'Di-Fr 09:30-12:30 Uhr und 13:30-17:30 Uhr, Sa 09:30-13:30 Uhr, Mo geschlossen',
        instructions:
          'Online bestellen und versandkostenfrei im Electronic Center an der B299 in Pförring abholen. Bereitstellung in der Regel innerhalb von 4 Stunden.',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL Paket',
          type: 'standard',
          carrier: 'DHL',
          cost: 5.99,
          freeShippingThreshold: null,
          deliveryDays: '1-3 Werktage',
          notes: 'Standardversand innerhalb Deutschlands',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung im Pollin Electronic Center Pförring',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'In der Regel 4 Stunden nach Bestelleingang',
          pickupLocation: {
            name: 'Pollin Electronic Center Pförring',
            address: 'Max-Pollin-Straße 1',
            city: 'Pförring',
            postalCode: '85104',
            country: 'DE',
            openingHours: 'Di-Fr 09:30-12:30 Uhr und 13:30-17:30 Uhr, Sa 09:30-13:30 Uhr, Mo geschlossen',
            instructions: 'Abholung an der Kasse des Electronic Centers nach Erhalt der Abholbenachrichtigung.',
          },
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/search?search=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      // Check if search redirected directly to a product detail page
      if ($('.product-detail-buy').length > 0) {
        const item = this.parseDetailPage($, searchUrl);
        if (item) {
          return this.applyOptions([item], options);
        }
      }

      const items: ComponentItem[] = [];

      $('.product-box').each((_, element) => {
        const $el = $(element);

        let productInfo: PollinProductInfo = {};
        const rawInfo = $el.attr('data-product-information');
        if (rawInfo) {
          try {
            productInfo = JSON.parse(rawInfo);
          } catch {
            // Ignore JSON parse errors
          }
        }

        const sku = productInfo.sku || productInfo.id;
        const linkEl = $el.find('a.product-image-link, a.product-name, a.product-title').first();
        const relativeOrAbsoluteUrl = linkEl.attr('href') || '';
        const productUrl = relativeOrAbsoluteUrl
          ? new URL(relativeOrAbsoluteUrl, this.metadata.baseUrl).toString()
          : '';

        const idFromUrl = productUrl.match(/-([0-9a-zA-Z]+)(?:[#?]|$)/)?.[1];
        const id = sku || idFromUrl || productInfo.id;
        if (!id) return;

        const title =
          productInfo.name ||
          $el.find('.product-title, .product-name').first().text().trim() ||
          linkEl.attr('title')?.trim() ||
          '';

        let price = typeof productInfo.price === 'number' ? roundEur(productInfo.price) : null;
        if (price === null) {
          const priceText = $el.find('.product-price').first().text().trim();
          price = parseEurPrice(priceText);
        }
        if (price === null) return;

        const imgEl = $el.find('.product-image img, .product-image-wrapper img').first();
        const rawImgUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';
        const imageUrl = rawImgUrl ? new URL(rawImgUrl, this.metadata.baseUrl).toString() : null;

        const deliveryText =
          $el.find('.product-delivery-information, .delivery-status, .badge-delivery').text().trim() ||
          'Lieferzeit 1-3 Werktage';
        const isOutOfStock =
          deliveryText.toLowerCase().includes('nicht lieferbar') ||
          deliveryText.toLowerCase().includes('ausverkauft') ||
          $el.find('.badge-out-of-stock').length > 0;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: productInfo.brand || null,
          sku: productInfo.sku || id,
          price,
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock: !isOutOfStock,
          stockDescription: deliveryText || (isOutOfStock ? 'Nicht lieferbar' : 'Auf Lager'),
          url: productUrl || `${this.metadata.baseUrl}/search?search=${encodeURIComponent(id)}`,
          imageUrl,
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
      const searchUrl = `${this.metadata.baseUrl}/search?search=${encodeURIComponent(id)}`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      // Check if redirected directly to detail page
      if ($('.product-detail-buy').length > 0) {
        const canonicalUrl = $('link[rel="canonical"]').attr('href') || searchUrl;
        return this.parseDetailPage($, canonicalUrl, id);
      }

      // Check search result listings
      const results = await this.search(id);
      const exactMatch = results.find(item => item.id === id || item.sku === id);
      return exactMatch ?? results[0] ?? null;
    } catch {
      return null;
    }
  }

  private parseDetailPage($: CheerioAPI, url: string, fallbackId?: string): ComponentItem | null {
    const title = $('h1.product-detail-name, h1').first().text().trim();
    if (!title) return null;

    const orderNumberText = $('.product-detail-ordernumber, .ordernumber-container').text().trim();
    const idMatch = url.match(/-([0-9a-zA-Z]+)(?:[#?]|$)/);
    const id = orderNumberText.replace(/[^0-9a-zA-Z]/g, '') || idMatch?.[1] || fallbackId;
    if (!id) return null;

    const priceText = $('.product-detail-price, .price').first().text().trim();
    const price = parseEurPrice(priceText);
    if (price === null) return null;

    const imgEl = $('.gallery-slider-item img, .product-detail-media img').first();
    const rawImgUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';
    const imageUrl = rawImgUrl ? new URL(rawImgUrl, this.metadata.baseUrl).toString() : null;

    const deliveryText =
      $('.product-detail-delivery-information, .delivery-information').first().text().trim() ||
      'Lieferzeit 1-3 Werktage';
    const isOutOfStock =
      deliveryText.toLowerCase().includes('nicht lieferbar') ||
      deliveryText.toLowerCase().includes('ausverkauft') ||
      $('.btn-buy').attr('disabled') !== undefined;

    const brand = $('.product-detail-manufacturer img').attr('alt')?.trim() || null;

    return {
      id,
      slug: `${this.metadata.id}:${id}`,
      shopId: this.metadata.id,
      shopName: this.metadata.name,
      title,
      brand,
      sku: id,
      price,
      currency: 'EUR',
      formattedPrice: formatEur(price),
      inStock: !isOutOfStock,
      stockDescription: deliveryText || (isOutOfStock ? 'Nicht lieferbar' : 'Auf Lager'),
      url: new URL(url, this.metadata.baseUrl).toString(),
      imageUrl,
      shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
      category: null,
    };
  }
}
