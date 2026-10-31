import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface AliExpressRawItem {
  productId?: string | number;
  title?: {
    displayTitle?: string;
    seoTitle?: string;
  };
  prices?: {
    salePrice?: {
      minPrice?: number;
      formattedPrice?: string;
      currencyCode?: string;
    };
  };
  image?: {
    imgUrl?: string;
  };
  logistics?: {
    freeShipping?: boolean;
    shippingMemo?: string;
  };
  store?: {
    storeName?: string;
  };
}

export class AliexpressShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'aliexpress',
    name: 'AliExpress',
    region: 'global',
    countryCode: 'GLOBAL',
    supportedCountries: ['global', 'de', 'us', 'uk', 'eu'],
    baseUrl: 'https://www.aliexpress.com',
    shippingPolicy: {
      standardCarrier: 'AliExpress Standard Shipping / Choice',
      standardCost: 2.99,
      freeShippingThreshold: 10.0,
      currency: 'EUR',
      deliveryDays: '7–15 Werktage',
      policyUrl: 'https://customerservice.aliexpress.com',
      notes: 'AliExpress Choice: Kostenloser Versand ab 10,00 € Bestellwert. Standardversand für Einzelartikel ca. 2,99 €.',
      defaultMethodId: 'choice_standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'choice_standard',
          name: 'AliExpress Standard / Choice',
          type: 'standard',
          carrier: 'AliExpress Standard Shipping',
          cost: 2.99,
          freeShippingThreshold: 10.0,
          deliveryDays: '7–15 Werktage',
          notes: 'Standardversand / Choice Bündelung ab 10 € kostenfrei',
        },
        {
          id: 'express',
          name: 'AliExpress Premium Shipping',
          type: 'express',
          carrier: 'AliExpress Premium',
          cost: 15.99,
          freeShippingThreshold: null,
          deliveryDays: '5–9 Werktage',
          notes: 'Schnellere Expresszustellung',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const formattedQuery = encodeURIComponent(query.trim().replace(/\s+/g, '-'));
    const url = `${this.metadata.baseUrl}/w/wholesale-${formattedQuery}.html`;

    try {
      const html = await httpClient.fetchHtml(url);
      const items = this.parseFromEmbeddedData(html);

      if (items.length > 0) {
        return this.applyOptions(items, options);
      }

      // Fallback: parse DOM cards if embedded JSON is not present
      const domItems = this.parseFromDom(html);
      return this.applyOptions(domItems, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    const detailUrl = `${this.metadata.baseUrl}/item/${encodeURIComponent(id)}.html`;
    try {
      const html = await httpClient.fetchHtml(detailUrl);
      const $ = httpClient.loadCheerio(html);

      const title = $('h1[data-pl="product-title"], h1').first().text().trim();
      if (!title) {
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      const priceText = $('[class*="price"], .product-price-current').first().text();
      const price = parseEurPrice(priceText) ?? 0;

      const imgEl = $('img[class*="magnifier"], .image-viewer img, img').first();
      let imageUrl = imgEl.attr('src') || null;
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = `https:${imageUrl}`;
      }

      return {
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
        inStock: true,
        stockDescription: 'Auf Lager',
        url: detailUrl,
        imageUrl,
        shippingEstimate: '7–15 Werktage',
        category: null,
      };
    } catch {
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    }
  }

  private parseFromEmbeddedData(html: string): ComponentItem[] {
    const startMarker = 'window._dida_config_._init_data_=';
    const endMarker = '/*!-->init-data-end--*/';

    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) return [];

    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx === -1) return [];

    let rawJs = html.slice(startIdx + startMarker.length, endIdx).trim();
    if (rawJs.startsWith('{ data:')) {
      rawJs = '{"data":' + rawJs.slice(7);
    }

    try {
      const parsed = JSON.parse(rawJs) as {
        data?: {
          data?: {
            root?: {
              fields?: {
                mods?: {
                  itemList?: {
                    content?: AliExpressRawItem[];
                  };
                };
              };
            };
          };
          root?: {
            fields?: {
              mods?: {
                itemList?: {
                  content?: AliExpressRawItem[];
                };
              };
            };
          };
        };
      };

      const rawItems: AliExpressRawItem[] =
        parsed.data?.data?.root?.fields?.mods?.itemList?.content ||
        parsed.data?.root?.fields?.mods?.itemList?.content ||
        [];

      const items: ComponentItem[] = [];

      for (const raw of rawItems) {
        if (!raw.productId) continue;
        const id = String(raw.productId);
        const title = raw.title?.displayTitle || raw.title?.seoTitle;
        if (!title) continue;

        let price = raw.prices?.salePrice?.minPrice;
        if (price === undefined && raw.prices?.salePrice?.formattedPrice) {
          price = parseEurPrice(raw.prices.salePrice.formattedPrice) ?? 0;
        }
        if (price === undefined) {
          price = 0;
        }

        let imageUrl = raw.image?.imgUrl || null;
        if (imageUrl && imageUrl.startsWith('//')) {
          imageUrl = `https:${imageUrl}`;
        }

        const isFreeShipping = Boolean(raw.logistics?.freeShipping);
        const shippingEstimate = isFreeShipping
          ? 'Kostenloser Versand'
          : raw.logistics?.shippingMemo || '7–15 Werktage';

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: raw.store?.storeName || null,
          sku: null,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock: true,
          stockDescription: 'Auf Lager',
          url: `${this.metadata.baseUrl}/item/${id}.html`,
          imageUrl,
          shippingEstimate,
          category: null,
        });
      }

      return items;
    } catch {
      return [];
    }
  }

  private parseFromDom(html: string): ComponentItem[] {
    const $ = httpClient.loadCheerio(html);
    const items: ComponentItem[] = [];

    $('[class*="search-item-card"], [class*="searchCard"]').each((_, element) => {
      const card = $(element);
      const link = card.find('a[href*="/item/"]').first();
      const href = link.attr('href') || '';
      const idMatch = href.match(/\/item\/(\d+)\.html/);
      if (!idMatch) return;

      const id = idMatch[1];
      const title = card.find('h1, h3, [class*="title"]').first().text().trim();
      if (!title) return;

      const priceText = card.find('[class*="price"]').first().text();
      const price = parseEurPrice(priceText) ?? 0;

      const imgEl = card.find('img').first();
      let imageUrl = imgEl.attr('src') || null;
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = `https:${imageUrl}`;
      }

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
        inStock: true,
        stockDescription: 'Auf Lager',
        url: `${this.metadata.baseUrl}/item/${id}.html`,
        imageUrl,
        shippingEstimate: '7–15 Werktage',
        category: null,
      });
    });

    return items;
  }
}
