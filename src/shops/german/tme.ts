import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface TmeRawProduct {
  productId: number;
  symbol: string;
  manufacturerSymbol?: string;
  manufacturer?: {
    name?: string;
  };
  description?: string;
  category?: {
    name?: string;
  };
  unit?: {
    shortName?: string;
  };
  url?: string;
  absoluteUrl?: string;
  assets?: {
    primary?: {
      thumb?: string;
      medium?: string;
    };
  };
}

interface TmePriceElement {
  amount: number;
  price: number;
}

interface TmeProductDataResponse {
  products?: Array<{
    symbol: string;
    stock: number;
    priceGroup?: {
      currency: string;
      elements?: TmePriceElement[];
    };
  }>;
}

export class TmeShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'tme',
    name: 'TME (Transfer Multisort Elektronik)',
    region: 'de',
    countryCode: 'PL',
    supportedCountries: ['de', 'at', 'pl', 'eu'],
    baseUrl: 'https://www.tme.eu',
    shippingPolicy: {
      standardCarrier: 'DHL Paket / GLS',
      standardCost: 9.40,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1-2 Werktage',
      policyUrl: 'https://www.tme.eu/de/how-to-buy/7345/Transportart-und-Transportkosten/',
      notes: 'Standardversand nach Deutschland per DHL Paket oder GLS ab 7,90 € netto (9,40 € brutto) bis 15 kg. Expressversand per UPS/DHL/FedEx Express möglich.',
      defaultMethodId: 'dhl_standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'dhl_standard',
          name: 'DHL Paket Standard',
          type: 'standard',
          carrier: 'DHL Paket',
          cost: 9.40,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Standard-Straßentransport per DHL Paket bis 15 kg (7,90 € netto / 9,40 € brutto)',
        },
        {
          id: 'gls_standard',
          name: 'GLS Standard',
          type: 'standard',
          carrier: 'GLS',
          cost: 9.40,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Standard-Straßentransport per GLS bis 15 kg (7,90 € netto / 9,40 € brutto)',
        },
        {
          id: 'ups_express',
          name: 'UPS Express Saver',
          type: 'express',
          carrier: 'UPS',
          cost: 18.92,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'Expressversand per Flugzeug bis 10 kg (15,90 € netto / 18,92 € brutto)',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express',
          type: 'express',
          carrier: 'DHL Express',
          cost: 18.92,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'Expressversand per Flugzeug bis 10 kg (15,90 € netto / 18,92 € brutto)',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/de/katalog/?search=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      const reactJson = $('.js-react-on-rails-component').text();
      if (!reactJson) {
        return [];
      }

      const componentData = JSON.parse(reactJson);
      const rawInitial = componentData?.initialResponse;
      if (!rawInitial) {
        return [];
      }

      const initialResponse = typeof rawInitial === 'string' ? JSON.parse(rawInitial) : rawInitial;
      const rawProducts: TmeRawProduct[] = initialResponse?.productList?.products || [];
      if (rawProducts.length === 0) {
        return [];
      }

      const priceAndStockMap = await this.fetchPricesAndStock(rawProducts.map(p => p.symbol));

      const items: ComponentItem[] = [];

      for (const p of rawProducts) {
        const id = p.symbol || String(p.productId);
        const data = priceAndStockMap.get(p.symbol);

        const stock = data ? data.stock : 0;
        const inStock = stock > 0;
        const stockDescription = inStock ? `${stock} auf Lager` : 'Nicht auf Lager';

        const unitPrice = data?.unitPrice ?? 0;
        const formattedPrice = formatEur(unitPrice);

        const titleParts = [p.manufacturerSymbol, p.description].filter(Boolean);
        const title = titleParts.length > 0 ? titleParts.join(' - ') : p.symbol;

        const productUrl = p.absoluteUrl
          ? p.absoluteUrl
          : p.url
            ? `${this.metadata.baseUrl}${p.url}`
            : `${this.metadata.baseUrl}/de/details/${encodeURIComponent(p.symbol)}/`;

        const imageUrl = p.assets?.primary?.medium || p.assets?.primary?.thumb || null;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: p.manufacturer?.name || null,
          sku: p.symbol || null,
          price: unitPrice,
          currency: 'EUR',
          formattedPrice,
          inStock,
          stockDescription,
          url: productUrl,
          imageUrl,
          shippingEstimate: '1-2 Werktage',
          category: p.category?.name || null,
        });
      }

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      const items = await this.search(id, { limit: 5 });
      const exact = items.find(
        i => i.id.toLowerCase() === id.toLowerCase() || i.sku?.toLowerCase() === id.toLowerCase(),
      );
      return exact || items[0] || null;
    } catch {
      return null;
    }
  }

  private async fetchPricesAndStock(
    symbols: string[],
  ): Promise<Map<string, { stock: number; unitPrice: number }>> {
    const map = new Map<string, { stock: number; unitPrice: number }>();
    if (symbols.length === 0) return map;

    try {
      const postData = {
        isFactoredPrice: false,
        isGrossPrice: 'true',
        items: symbols.map(s => ({ symbol: s })),
        scope: ['prices', 'stock'],
      };

      const raw = await httpClient.request(
        `${this.metadata.baseUrl}/ajax/common/product/data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postData),
        },
      );

      const res: TmeProductDataResponse = JSON.parse(raw);

      if (res?.products && Array.isArray(res.products)) {
        for (const item of res.products) {
          const elements = item.priceGroup?.elements || [];
          let unitPrice = 0;
          if (elements.length > 0) {
            const sorted = [...elements].sort((a, b) => a.amount - b.amount);
            unitPrice = roundEur(sorted[0].price);
          }
          map.set(item.symbol, {
            stock: item.stock || 0,
            unitPrice,
          });
        }
      }
    } catch {
      // Fallback: return empty map
    }

    return map;
  }
}
