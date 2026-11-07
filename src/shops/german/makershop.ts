import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class MakershopShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'makershop',
    name: 'Makershop',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.makershop.de',
    shippingPolicy: {
      standardCarrier: 'Deutsche Post / DHL',
      standardCost: 2.5,
      freeShippingThreshold: 10.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.makershop.de/versandmethoden/',
      notes: 'Kostenloser Versand ab 10,00 € Bestellwert innerhalb Deutschlands. Unter 10,00 € pauschal 2,50 € Versandkosten (Deutsche Post Brief oder DHL Paket).',
      defaultMethodId: 'standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'standard',
          name: 'Deutsche Post / DHL Paket',
          type: 'standard',
          carrier: 'Deutsche Post / DHL',
          cost: 2.5,
          freeShippingThreshold: 10.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Versand per Deutsche Post Brief, Warenpost mit Sendungsverfolgung oder DHL Paket.',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/?s=${encodeURIComponent(query)}&post_type=product`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);
      const items: ComponentItem[] = [];

      $('.product.type-product').each((_, element) => {
        try {
          const $el = $(element);

          const rawId =
            $el.attr('data-id') ||
            $el
              .attr('class')
              ?.split(' ')
              .find((c) => c.startsWith('post-'))
              ?.replace('post-', '');

          if (!rawId) {
            return;
          }

          const titleEl = $el.find('.wd-entities-title a, .woocommerce-loop-product__title, h2 a, h3 a').first();
          const title = titleEl.text().trim();
          if (!title) {
            return;
          }

          const link = titleEl.attr('href') || $el.find('a.wd-product-img-link, a.woocommerce-LoopProduct-link').first().attr('href') || '';
          const productUrl = link.startsWith('http') ? link : `${this.metadata.baseUrl}${link}`;

          // Price parsing: check ins (discounted) first, then .price
          const priceContainer = $el.find('.price');
          const insPrice = priceContainer.find('ins .woocommerce-Price-amount').text().trim();
          const rawPriceText = insPrice || priceContainer.find('.woocommerce-Price-amount').first().text().trim() || priceContainer.text().trim();
          const price = parseEurPrice(rawPriceText);

          // Stock determination
          const classList = $el.attr('class') || '';
          const isOutOfStock = classList.includes('outofstock');
          const isInStock = classList.includes('instock') || !isOutOfStock;

          // Image
          const img = $el.find('img').first();
          const imageUrl =
            img.attr('data-lazy-src') ||
            img.attr('data-src') ||
            img.attr('src') ||
            undefined;

          const absoluteImageUrl = imageUrl?.startsWith('http')
            ? imageUrl
            : imageUrl
              ? `${this.metadata.baseUrl}${imageUrl}`
              : undefined;

          const parsedPrice = price !== null ? roundEur(price) : 0;
          items.push({
            id: rawId,
            shopId: this.metadata.id,
            shopName: this.metadata.name,
            slug: `${this.metadata.id}:${rawId}`,
            title,
            brand: null,
            sku: null,
            price: parsedPrice,
            formattedPrice: formatEur(parsedPrice),
            currency: 'EUR',
            inStock: isInStock,
            stockDescription: isInStock ? 'Auf Lager (1-3 Werktage)' : 'Nicht vorrätig',
            url: productUrl,
            imageUrl: absoluteImageUrl || null,
            shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
            category: null,
          });
        } catch {
          // Skip malformed item
        }
      });

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      // Makershop supports WordPress standard ?p=<postId> query or SKU search
      const detailUrl = `${this.metadata.baseUrl}/?p=${encodeURIComponent(id)}`;
      const html = await httpClient.fetchHtml(detailUrl);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1.product_title').text().trim();
      if (!title) {
        // Fallback: search by id
        const searchResults = await this.search(id);
        const matched = searchResults.find((item) => item.id === id);
        return matched ?? null;
      }

      const priceContainer = $('.summary .price');
      const insPrice = priceContainer.find('ins .woocommerce-Price-amount').text().trim();
      const rawPriceText =
        insPrice ||
        priceContainer.find('.woocommerce-Price-amount').first().text().trim() ||
        priceContainer.text().trim();
      const price = parseEurPrice(rawPriceText);

      const stockText = $('.summary .stock').text().trim();
      const isOutOfStock = stockText.toLowerCase().includes('nicht') || $('body').hasClass('outofstock');
      const isInStock = !isOutOfStock;

      const img = $('.woocommerce-product-gallery img').first();
      const imageUrl =
        img.attr('data-large_image') ||
        img.attr('data-lazy-src') ||
        img.attr('data-src') ||
        img.attr('src') ||
        undefined;

      const absoluteImageUrl = imageUrl?.startsWith('http')
        ? imageUrl
        : imageUrl
          ? `${this.metadata.baseUrl}${imageUrl}`
          : undefined;

      // Canonical link
      const canonical = $('link[rel="canonical"]').attr('href');
      const productUrl = canonical || detailUrl;

      const parsedPrice = price !== null ? roundEur(price) : 0;
      return {
        id,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        slug: `${this.metadata.id}:${id}`,
        title,
        brand: null,
        sku: null,
        price: parsedPrice,
        formattedPrice: formatEur(parsedPrice),
        currency: 'EUR',
        inStock: isInStock,
        stockDescription: stockText || (isInStock ? 'Auf Lager (1-3 Werktage)' : 'Nicht vorrätig'),
        url: productUrl,
        imageUrl: absoluteImageUrl || null,
        shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
        category: null,
      };
    } catch {
      return null;
    }
  }
}
