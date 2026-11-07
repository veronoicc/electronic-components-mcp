import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface MouserApiSearchResponse {
  Errors?: Array<{ Message?: string }>;
  SearchResults?: {
    NumberOfResult?: number;
    Parts?: Array<{
      Availability?: string;
      Description?: string;
      DataSheetUrl?: string;
      ImagePath?: string;
      Category?: string;
      LeadTime?: string;
      LifecycleStatus?: string;
      Manufacturer?: string;
      ManufacturerPartNumber?: string;
      Min?: string;
      Mult?: string;
      MouserPartNumber?: string;
      ProductDetailUrl?: string;
      PriceBreaks?: Array<{
        Quantity?: number;
        Price?: string;
        Currency?: string;
      }>;
      ProductAttributes?: Array<{
        AttributeName?: string;
        AttributeValue?: string;
      }>;
    }>;
  };
}

export class MouserShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'mouser',
    name: 'Mouser Electronics',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.mouser.de',
    shippingPolicy: {
      standardCarrier: 'UPS / FedEx / DHL Express',
      standardCost: 20.0,
      freeShippingThreshold: 50.0, // 50 € net / 59.50 € gross, or 75 € net threshold
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://www.mouser.de/help/orders-shipping/shipping-costs-explained/',
      notes:
        'Standardversand per Express (DHL Express, FedEx oder UPS) aus dem Zentrallager USA direkt nach Deutschland (DDP - verzollt und versteuert). Versandkostenfrei ab 50,00 € Nettowarenwert (ca. 59,50 € brutto), darunter pauschal 20,00 €.',
      defaultMethodId: 'ups_express',
      pickupAvailable: false,
      methods: [
        {
          id: 'ups_express',
          name: 'UPS Express Saver (DDP)',
          type: 'express',
          carrier: 'UPS',
          cost: 20.0,
          freeShippingThreshold: 50.0,
          deliveryDays: '1-3 Werktage',
          notes: 'DDP - keine Zollgebühren an der Haustür',
        },
        {
          id: 'fedex_express',
          name: 'FedEx International Priority (DDP)',
          type: 'express',
          carrier: 'FedEx',
          cost: 20.0,
          freeShippingThreshold: 50.0,
          deliveryDays: '1-3 Werktage',
          notes: 'DDP - keine Zollgebühren an der Haustür',
        },
        {
          id: 'dhl_express',
          name: 'DHL Express Worldwide (DDP)',
          type: 'express',
          carrier: 'DHL Express',
          cost: 20.0,
          freeShippingThreshold: 50.0,
          deliveryDays: '1-3 Werktage',
          notes: 'DDP - keine Zollgebühren an der Haustür',
        },
      ],
    },
  };

  /**
   * Search Mouser for components.
   * Checks for MOUSER_API_KEY environment variable to use the official Mouser Search API.
   * Otherwise falls back to web scraping / HTML search parsing with graceful error handling.
   */
  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const apiKey = process.env.MOUSER_API_KEY;
      if (apiKey) {
        return await this.searchViaApi(query, apiKey, options);
      }
      return await this.searchViaHtml(query, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      const apiKey = process.env.MOUSER_API_KEY;
      if (apiKey) {
        return await this.getByIdViaApi(id, apiKey);
      }
      return await this.getByIdViaHtml(id);
    } catch {
      return null;
    }
  }

  private async searchViaApi(
    query: string,
    apiKey: string,
    options?: SearchOptions
  ): Promise<ComponentItem[]> {
    const url = `https://api.mouser.com/api/v1.0/search/keyword?apiKey=${encodeURIComponent(apiKey)}`;
    const limit = options?.limit ?? 25;
    const payload = {
      SearchByKeywordRequest: {
        keyword: query,
        records: Math.min(limit, 50),
        startingRecord: 0,
        searchOptions: 'None',
        searchWithYourSignUpLanguage: 'German',
      },
    };

    const raw = await httpClient.request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const data: MouserApiSearchResponse = JSON.parse(raw);

    const parts = data.SearchResults?.Parts ?? [];
    const items: ComponentItem[] = [];

    for (const part of parts) {
      const mfrPartNumber = part.ManufacturerPartNumber || '';
      const mouserPartNumber = part.MouserPartNumber || '';
      const id = mouserPartNumber || mfrPartNumber;
      if (!id) continue;

      const title = `${part.Manufacturer ? `${part.Manufacturer} ` : ''}${mfrPartNumber}${
        part.Description ? ` - ${part.Description}` : ''
      }`.trim();

      let price = 0;
      if (part.PriceBreaks && part.PriceBreaks.length > 0) {
        const firstBreak = part.PriceBreaks[0];
        if (firstBreak?.Price) {
          price = parseEurPrice(firstBreak.Price) ?? 0;
        }
      }

      const inStock = Boolean(
        part.Availability && !part.Availability.toLowerCase().includes('nicht') && !part.Availability.startsWith('0')
      );
      const stockDescription = part.Availability || (inStock ? 'Auf Lager' : 'Nicht auf Lager');

      const productUrl = part.ProductDetailUrl?.startsWith('http')
        ? part.ProductDetailUrl
        : `${this.metadata.baseUrl}${part.ProductDetailUrl ?? ''}`;

      items.push({
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: part.Manufacturer || null,
        sku: mouserPartNumber || mfrPartNumber || null,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription,
        url: productUrl,
        imageUrl: part.ImagePath || null,
        shippingEstimate: '1-3 Werktage',
        category: part.Category || null,
      });
    }

    return this.applyOptions(items, options);
  }

  private async getByIdViaApi(id: string, apiKey: string): Promise<ComponentItem | null> {
    const url = `https://api.mouser.com/api/v1.0/search/partnumber?apiKey=${encodeURIComponent(apiKey)}`;
    const payload = {
      SearchByPartRequest: {
        mouserPartNumber: id,
        partSearchOptions: 'Exact',
      },
    };

    const raw = await httpClient.request(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const data: MouserApiSearchResponse = JSON.parse(raw);

    const part = data.SearchResults?.Parts?.[0];
    if (!part) return null;

    const mfrPartNumber = part.ManufacturerPartNumber || '';
    const mouserPartNumber = part.MouserPartNumber || '';
    const title = `${part.Manufacturer ? `${part.Manufacturer} ` : ''}${mfrPartNumber}${
      part.Description ? ` - ${part.Description}` : ''
    }`.trim();

    let price = 0;
    if (part.PriceBreaks && part.PriceBreaks.length > 0) {
      const firstBreak = part.PriceBreaks[0];
      if (firstBreak?.Price) {
        price = parseEurPrice(firstBreak.Price) ?? 0;
      }
    }

    const inStock = Boolean(
      part.Availability && !part.Availability.toLowerCase().includes('nicht') && !part.Availability.startsWith('0')
    );
    const stockDescription = part.Availability || (inStock ? 'Auf Lager' : 'Nicht auf Lager');

    const productUrl = part.ProductDetailUrl?.startsWith('http')
      ? part.ProductDetailUrl
      : `${this.metadata.baseUrl}${part.ProductDetailUrl ?? ''}`;

    return {
      id: mouserPartNumber || id,
      slug: `${this.metadata.id}:${id}`,
      shopId: this.metadata.id,
      shopName: this.metadata.name,
      title,
      brand: part.Manufacturer || null,
      sku: mouserPartNumber || mfrPartNumber || null,
      price: roundEur(price),
      currency: 'EUR',
      formattedPrice: formatEur(price),
      inStock,
      stockDescription,
      url: productUrl,
      imageUrl: part.ImagePath || null,
      shippingEstimate: '1-3 Werktage',
      category: part.Category || null,
    };
  }

  private async searchViaHtml(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    const searchUrl = `${this.metadata.baseUrl}/c/?q=${encodeURIComponent(query)}`;
    const html = await httpClient.fetchHtml(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const $ = httpClient.loadCheerio(html);
    const items: ComponentItem[] = [];

    $('#SearchResultsGrid_grid tbody tr, table.SearchResultsGrid tbody tr').each((_, element) => {
      const row = $(element);
      const mfrPartNumber = row.attr('data-mfrpartnumber') || '';
      const mouserPartNumber = row.attr('data-partnumber') || '';
      const manufacturer = row.attr('data-actualmfrname') || '';

      const linkEl = row.find("a[href*='/ProductDetail/']").first();
      const rawUrl = linkEl.attr('href') || '';
      if (!rawUrl && !mouserPartNumber && !mfrPartNumber) return;

      const titleText = linkEl.text().trim() || row.find('.desc-column').text().trim();
      const title = `${manufacturer ? `${manufacturer} ` : ''}${mfrPartNumber || mouserPartNumber}${
        titleText ? ` - ${titleText}` : ''
      }`.trim();

      const id = mouserPartNumber || mfrPartNumber || encodeURIComponent(title.slice(0, 32));
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

      const rawPrice = row.find('.price-column, td[data-title="Price"]').first().text().trim();
      const price = parseEurPrice(rawPrice) ?? 0;

      const imgEl = row.find('img').first();
      const imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;

      const availText = row.find('.avail-column, td[data-title="Availability"]').first().text().trim();
      const inStock = Boolean(
        availText && !availText.toLowerCase().includes('nicht') && !availText.startsWith('0')
      );
      const stockDescription = availText || (inStock ? 'Auf Lager' : 'Nicht auf Lager');

      items.push({
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: manufacturer || null,
        sku: mouserPartNumber || mfrPartNumber || null,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription,
        url: fullUrl,
        imageUrl,
        shippingEstimate: '1-3 Werktage',
        category: null,
      });
    });

    return this.applyOptions(items, options);
  }

  private async getByIdViaHtml(id: string): Promise<ComponentItem | null> {
    const detailUrl = `${this.metadata.baseUrl}/ProductDetail/${encodeURIComponent(id)}`;
    try {
      const html = await httpClient.fetchHtml(detailUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const $ = httpClient.loadCheerio(html);

      // Check for JSON-LD Product schema
      let jsonLdProduct: Record<string, unknown> | null = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const content = $(el).html();
          if (!content) return;
          const parsed = JSON.parse(content.trim());
          if (parsed['@type'] === 'Product') {
            jsonLdProduct = parsed;
          } else if (Array.isArray(parsed['@graph'])) {
            const found = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Product');
            if (found) jsonLdProduct = found;
          }
        } catch {
          // Ignore JSON-LD parse errors
        }
      });

      if (jsonLdProduct) {
        const p = jsonLdProduct as Record<string, any>;
        const name = (p.name as string) || (p.mpn as string) || id;
        const brand = typeof p.brand === 'object' && p.brand !== null ? (p.brand.name as string) : (p.brand as string) || null;
        const title = `${brand ? `${brand} ` : ''}${name}`;
        const rawPrice = p.offers?.price ? String(p.offers.price) : '';
        const price = parseEurPrice(rawPrice) ?? 0;
        const inStock = p.offers?.availability
          ? String(p.offers.availability).includes('InStock')
          : true;

        return {
          id: (p.sku as string) || id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand: brand || null,
          sku: (p.sku as string) || (p.mpn as string) || null,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription: inStock ? 'Auf Lager' : 'Nicht auf Lager',
          url: detailUrl,
          imageUrl: (p.image as string) || null,
          shippingEstimate: '1-3 Werktage',
          category: null,
        };
      }

      // Fallback: search by id
      const results = await this.searchViaHtml(id, { limit: 1 });
      return results[0] ?? null;
    } catch {
      return null;
    }
  }
}
