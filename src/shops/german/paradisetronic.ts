import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface ShopifySuggestProduct {
  id: number | string;
  title: string;
  url: string;
  image?: string;
  featured_image?: {
    url?: string;
  };
  price: string;
  available: boolean;
  vendor?: string;
  type?: string;
  handle?: string;
}

interface ShopifySuggestResponse {
  resources?: {
    results?: {
      products?: ShopifySuggestProduct[];
    };
  };
}

export class ParadisetronicShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'paradisetronic',
    name: 'Paradisetronic',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'eu'],
    baseUrl: 'https://paradisetronic.com',
    shippingPolicy: {
      standardCarrier: 'DHL',
      standardCost: 3.5,
      freeShippingThreshold: 40.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://paradisetronic.com/policies/shipping-policy',
      notes:
        'DHL-Kleinpaket / Paket: 3,50 € pro Bestellung. Versandkostenfrei ab 40,00 € Bestellwert. Kostenlose Abholung in Berlin-Reinickendorf nach Terminvereinbarung.',
      defaultMethodId: 'dhl',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Tinkerly GmbH (Paradisetronic)',
        address: 'Breitenbachstr. 24',
        city: 'Berlin',
        postalCode: '13509',
        country: 'DE',
        openingHours: 'Nach Terminvereinbarung',
        instructions:
          'Abholung und EC-Kartenzahlung nach vorheriger Terminvereinbarung (Berlin-Reinickendorf).',
      },
      methods: [
        {
          id: 'dhl',
          name: 'DHL-Kleinpaket / -Paket',
          type: 'standard',
          carrier: 'DHL',
          cost: 3.5,
          freeShippingThreshold: 40.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Übergabe an DHL innerhalb von 1 Werktag nach Zahlungseingang. Lieferung auch an Packstation möglich.',
        },
        {
          id: 'pickup',
          name: 'Selbstabholung',
          type: 'pickup',
          carrier: 'Abholung',
          cost: 0,
          freeShippingThreshold: 0,
          deliveryDays: 'Nach Vereinbarung',
          notes: 'Abholung nach Terminvereinbarung in Berlin-Reinickendorf (Breitenbachstr. 24, 13509 Berlin).',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      // 1. Try Shopify Predictive Search Suggest API
      const suggestUrl = `${this.metadata.baseUrl}/search/suggest.json?q=${encodeURIComponent(
        query
      )}&resources[type]=product&resources[options][unavailable_products]=show`;

      try {
        const data = (await httpClient.fetchJson(suggestUrl)) as ShopifySuggestResponse;
        const products = data.resources?.results?.products;
        if (products && products.length > 0) {
          const items: ComponentItem[] = products.map((product) => {
            const rawHandle = product.handle || String(product.id);
            const id = rawHandle;
            const price = roundEur(parseEurPrice(product.price) ?? 0);
            let rawUrl = product.url || `/products/${product.handle}`;
            if (rawUrl.startsWith('/')) {
              rawUrl = `${this.metadata.baseUrl}${rawUrl}`;
            }
            const cleanUrl = rawUrl.split('?')[0] ?? rawUrl;

            let imageUrl = product.image || product.featured_image?.url || null;
            if (imageUrl && imageUrl.startsWith('//')) {
              imageUrl = `https:${imageUrl}`;
            }

            return {
              id,
              slug: `${this.metadata.id}:${id}`,
              shopId: this.metadata.id,
              shopName: this.metadata.name,
              title: product.title,
              brand: product.vendor || null,
              sku: null,
              price,
              currency: 'EUR',
              formattedPrice: formatEur(price),
              inStock: Boolean(product.available),
              stockDescription: product.available ? 'Lagernd' : 'Nicht auf Lager',
              url: cleanUrl,
              imageUrl,
              shippingEstimate: '1-3 Werktage per DHL',
              category: product.type || null,
            };
          });

          return this.applyOptions(items, options);
        }
      } catch {
        // Fall back to HTML search if JSON suggest fails
      }

      // 2. Fallback to HTML Search
      const searchUrl = `${this.metadata.baseUrl}/search?q=${encodeURIComponent(query)}&type=product`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('.product-grid .grid__item, #product-grid .grid__item').each((_, element) => {
        const card = $(element);

        // Find product link and title
        const linkEl = card.find('a[href*="/products/"]').first();
        let rawUrl = linkEl.attr('href') || '';
        if (!rawUrl) return;
        if (rawUrl.startsWith('/')) {
          rawUrl = `${this.metadata.baseUrl}${rawUrl}`;
        }
        const cleanUrl = rawUrl.split('?')[0] ?? rawUrl;

        const title =
          card.find('.card__heading a, .card-information h3 a, h3 a').first().text().trim() ||
          linkEl.text().trim();
        if (!title || title.length < 2) return;

        // Extract handle / id from product URL
        const handleMatch = cleanUrl.match(/\/products\/([^/?#]+)/);
        const id = handleMatch ? handleMatch[1] : cleanUrl.replace(/.*\/products\//, '').slice(0, 40);

        // Extract image
        const imgEl = card.find('img').first();
        let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        // Price
        const priceText = card.find('.price .price-item--last, .price-item--regular, .price').first().text();
        const price = roundEur(parseEurPrice(priceText) ?? 0);

        // Stock status
        const isSoldOut =
          card.find('.price--sold-out, .badge--bottom-left, .price__badge-sold-out').text().toLowerCase().includes('ausverkauft') ||
          card.hasClass('price--sold-out');
        const inStock = !isSoldOut;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: null,
          sku: null,
          price,
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription: inStock ? 'Lagernd' : 'Nicht auf Lager',
          url: cleanUrl,
          imageUrl,
          shippingEstimate: '1-3 Werktage per DHL',
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
      const handle = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const productUrl = `${this.metadata.baseUrl}/products/${handle}`;
      const html = await httpClient.fetchHtml(productUrl);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      let sku: string | null = null;
      let brand: string | null = null;
      let ldPrice: number | null = null;
      let ldInStock: boolean | null = null;
      let ldImage: string | null = null;

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).text()) as Record<string, unknown>;
          const graph = Array.isArray(json['@graph']) ? (json['@graph'] as Record<string, unknown>[]) : null;
          const productLd =
            json['@type'] === 'Product'
              ? json
              : graph?.find((item) => item['@type'] === 'Product');

          if (productLd) {
            if (typeof productLd.sku === 'string') {
              sku = productLd.sku;
            }
            const brandObj = productLd.brand as { name?: string } | undefined;
            if (brandObj?.name) {
              brand = brandObj.name;
            }
            const imgObj = productLd.image;
            if (typeof imgObj === 'string') {
              ldImage = imgObj;
            } else if (Array.isArray(imgObj) && typeof imgObj[0] === 'string') {
              ldImage = imgObj[0];
            }

            const rawOffers = productLd.offers;
            const offer = Array.isArray(rawOffers)
              ? (rawOffers[0] as Record<string, unknown> | undefined)
              : (rawOffers as Record<string, unknown> | undefined);

            if (offer) {
              if (offer.price !== undefined) {
                ldPrice = roundEur(Number(offer.price));
              }
              if (offer.availability) {
                ldInStock = String(offer.availability).includes('InStock');
              }
              if (!sku && typeof offer.sku === 'string') {
                sku = offer.sku;
              }
            }
          }
        } catch {
          // Ignore JSON-LD parse errors
        }
      });

      const rawPrice = $('.price .price-item--last, .price-item--regular, .price').first().text();
      const price = ldPrice ?? roundEur(parseEurPrice(rawPrice) ?? 0);

      const pageText = $('body').text();
      const hasSoldOut =
        $('.price--sold-out, .badge price__badge-sold-out, button[disabled]').text().toLowerCase().includes('ausverkauft') ||
        pageText.includes('Ausverkauft');
      const inStock = ldInStock ?? !hasSoldOut;

      let imageUrl = ldImage || $('img[src*="/cdn/shop/"]').first().attr('src') || null;
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = `https:${imageUrl}`;
      }

      return {
        id: handle,
        slug: `${this.metadata.id}:${handle}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand,
        sku,
        price,
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: inStock ? 'Lagernd' : 'Nicht auf Lager',
        url: productUrl,
        imageUrl,
        shippingEstimate: '1-3 Werktage per DHL',
        category: null,
      };
    } catch {
      return null;
    }
  }
}
