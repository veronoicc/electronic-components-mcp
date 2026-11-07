import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class FarnellShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'farnell',
    name: 'Farnell',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://de.farnell.com',
    shippingPolicy: {
      standardCarrier: 'UPS / DHL Express',
      standardCost: 11.99,
      freeShippingThreshold: 75.0,
      currency: 'EUR',
      deliveryDays: '1-2 Arbeitstage',
      policyUrl: 'https://de.farnell.com/help-delivery-information',
      notes:
        'Standard-Lieferung in 2 Arbeitstagen: 11,99 € (versandkostenfrei ab 75 € Bestellwert). Express-Lieferung am nächsten Arbeitstag bis 13 Uhr: 14,99 €.',
      defaultMethodId: 'standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'standard',
          name: 'Standard-Lieferung (2 Arbeitstage)',
          type: 'standard',
          carrier: 'UPS / DHL Express',
          cost: 11.99,
          freeShippingThreshold: 75.0,
          deliveryDays: '1-2 Arbeitstage',
          notes: 'Kostenlos ab 75 € Bestellwert, sonst 11,99 €.',
        },
        {
          id: 'express',
          name: 'Express-Lieferung (nächster Arbeitstag bis 13 Uhr)',
          type: 'express',
          carrier: 'UPS Express',
          cost: 14.99,
          freeShippingThreshold: null,
          deliveryDays: '1 Arbeitstag',
          notes: 'Zustellung am nächsten Arbeitstag bis 13:00 Uhr.',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/search?st=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      // Check table rows (Farnell standard search results: #sProdList tbody tr.productRow or table.productTable tr)
      const tableRows = $('table#sProdList tbody tr.productRow, tr.productRow, table.productTable tbody tr');
      if (tableRows.length > 0) {
        tableRows.each((_, element) => {
          const row = $(element);

          // Order code / SKU
          const orderCodeEl = row.find('td.orderCode, .orderCode, a.orderCode, td.sku, .sku').first();
          const sku = orderCodeEl.text().trim();
          const partId = row.attr('data-partnumber') || row.attr('data-product-id') || sku;
          if (!partId) return;

          // Product title / link
          const linkEl = row.find('td.productImageDesc a.productName, td.description a, a.productName, td a[href*="/dp/"]').first();
          const href = linkEl.attr('href') || orderCodeEl.attr('href') || '';
          const url = href.startsWith('http') ? href : `${this.metadata.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

          const title =
            linkEl.text().trim() ||
            row.find('td.description, .productDescription, .productName').first().text().trim();
          if (!title) return;

          // Manufacturer / Brand
          const brand =
            row.find('td.brand, .manufacturerName, .brandName, td.mfr').first().text().trim() || null;

          // Price extraction
          const priceText = row.find('td.price, .priceList, span[data-price], .priceContainer').first().text().trim();
          const parsedPrice = parseEurPrice(priceText);
          const price = parsedPrice !== null ? parsedPrice : 0;

          // Availability / Stock
          const stockText = row
            .find('td.availability, .inStockText, .availability, .inStock')
            .first()
            .text()
            .trim();
          const inStock =
            stockText.length > 0 &&
            !stockText.toLowerCase().includes('nicht vorrätig') &&
            !stockText.toLowerCase().includes('out of stock') &&
            !stockText.toLowerCase().includes('0 auf lager');

          // Image
          const imgEl = row.find('td.image img, td.productImage img, img').first();
          let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
          }

          items.push({
            id: partId,
            slug: `${this.metadata.id}:${partId}`,
            shopId: this.metadata.id,
            shopName: this.metadata.name,
            title,
            brand,
            sku: sku || partId,
            price: roundEur(price),
            currency: 'EUR',
            formattedPrice: formatEur(price),
            inStock,
            stockDescription: stockText || null,
            url,
            imageUrl,
            shippingEstimate: inStock ? '1-2 Arbeitstage' : null,
            category: null,
          });
        });
      } else {
        // Fallback for card / grid layouts (.productCard, .product-listing, etc.)
        $('.productCard, .product-item, .product-listing, [data-testid="productCard"]').each((_, element) => {
          const card = $(element);
          const linkEl = card.find('a[href*="/dp/"], a.productName, h3 a, h2 a, a').first();
          const href = linkEl.attr('href') || '';
          const url = href.startsWith('http') ? href : `${this.metadata.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

          const idMatch = url.match(/\/dp\/(\d+)/) || href.match(/\/(\d+)(\?|$)/);
          const partId = card.attr('data-product-id') || (idMatch ? idMatch[1] : null);
          const title = linkEl.text().trim() || card.find('h2, h3, .product-title').first().text().trim();
          if (!partId || !title) return;

          const brand = card.find('.manufacturer, .brand, [data-testid="brand"]').first().text().trim() || null;
          const sku = card.find('.order-code, .sku, [data-testid="orderCode"]').first().text().trim() || partId;

          const priceText = card.find('.price, [data-testid="price"]').first().text().trim();
          const parsedPrice = parseEurPrice(priceText);
          const price = parsedPrice !== null ? parsedPrice : 0;

          const stockText = card.find('.stock, .availability, [data-testid="stock"]').first().text().trim();
          const inStock =
            stockText.length > 0 &&
            !stockText.toLowerCase().includes('nicht vorrätig') &&
            !stockText.toLowerCase().includes('0 auf lager');

          const imgEl = card.find('img').first();
          let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
          }

          items.push({
            id: partId,
            slug: `${this.metadata.id}:${partId}`,
            shopId: this.metadata.id,
            shopName: this.metadata.name,
            title,
            brand,
            sku,
            price: roundEur(price),
            currency: 'EUR',
            formattedPrice: formatEur(price),
            inStock,
            stockDescription: stockText || null,
            url,
            imageUrl,
            shippingEstimate: inStock ? '1-2 Arbeitstage' : null,
            category: null,
          });
        });
      }

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      // Direct PDP lookup by order code / product ID
      const directUrl = `${this.metadata.baseUrl}/dp/${encodeURIComponent(id)}`;
      let html = '';
      try {
        html = await httpClient.fetchHtml(directUrl);
      } catch {
        // Fall back to search if direct URL fails
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      const $ = httpClient.loadCheerio(html);

      const title =
        $('h1[data-testid="product-title"], h1.product-title, h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      const brand =
        $('[data-testid="brand-name"], .manufacturerName, .brandName').first().text().trim() || null;
      const sku =
        $('[data-testid="order-code"], .orderCode, span.order-code').first().text().trim() || id;

      const priceText =
        $('[data-testid="product-price"], .standardPrice, .priceSection, .price').first().text().trim();
      const parsedPrice = parseEurPrice(priceText);
      const price = parsedPrice !== null ? parsedPrice : 0;

      const stockText =
        $('[data-testid="stock-status"], .availability, .stockStatus').first().text().trim();
      const inStock =
        stockText.length > 0 &&
        !stockText.toLowerCase().includes('nicht vorrätig') &&
        !stockText.toLowerCase().includes('0 auf lager');

      const imgEl = $('[data-testid="product-image"] img, .product-image img, img#mainImage').first();
      let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${this.metadata.baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      }

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand,
        sku,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: stockText || null,
        url: directUrl,
        imageUrl,
        shippingEstimate: inStock ? '1-2 Arbeitstage' : null,
        category: null,
      };
    } catch {
      return null;
    }
  }
}
