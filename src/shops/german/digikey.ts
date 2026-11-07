import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface DigiKeyProductCell {
  type: string;
  id?: string;
  value: unknown;
}

export class DigikeyShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'digikey',
    name: 'DigiKey',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu', 'global'],
    baseUrl: 'https://www.digikey.de',
    shippingPolicy: {
      standardCarrier: 'UPS / FedEx',
      standardCost: 25.0,
      freeShippingThreshold: 75.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage (meist 48 Std.)',
      policyUrl: 'https://www.digikey.de/de/help-support/delivery-information/delivery-time-and-cost',
      notes:
        'Standardversand per UPS oder FedEx: 25,00 € (versandkostenfrei ab 75,00 € Bestellwert). DDP (Verzollung und Einfuhrabgaben inklusive). Expresslieferung direkt aus Thief River Falls.',
      defaultMethodId: 'ups_express',
      pickupAvailable: false,
      methods: [
        {
          id: 'ups_express',
          name: 'UPS Express (DDP)',
          type: 'express',
          carrier: 'UPS',
          cost: 25.0,
          freeShippingThreshold: 75.0,
          deliveryDays: '1-3 Werktage (meist 48 Std.)',
          notes: 'DDP-Lieferung, verzollt und versteuert',
        },
        {
          id: 'fedex_express',
          name: 'FedEx International Priority (DDP)',
          type: 'express',
          carrier: 'FedEx',
          cost: 25.0,
          freeShippingThreshold: 75.0,
          deliveryDays: '1-3 Werktage (meist 48 Std.)',
          notes: 'DDP-Lieferung, verzollt und versteuert',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const resultUrl = `${this.metadata.baseUrl}/de/products/result?keywords=${encodeURIComponent(trimmed)}`;
      const resultHtml = await httpClient.fetchHtml(resultUrl);

      let items = this.parseHtmlOrNextData(resultHtml);

      // If search landed on a topResults category aggregator page, fetch the top category
      if (items.length === 0) {
        const topCategoryUrl = this.extractTopCategoryUrl(resultHtml);
        if (topCategoryUrl) {
          const catFullUrl = topCategoryUrl.startsWith('http')
            ? topCategoryUrl
            : `${this.metadata.baseUrl}${topCategoryUrl}${topCategoryUrl.includes('?') ? '&' : '?'}keywords=${encodeURIComponent(trimmed)}`;
          const catHtml = await httpClient.fetchHtml(catFullUrl);
          items = this.parseHtmlOrNextData(catHtml);
        }
      }

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      const cleanId = id.trim();
      if (!cleanId) return null;

      // 1. If ID is already a URL or path, fetch directly
      if (cleanId.startsWith('/de/products/detail/') || cleanId.startsWith('http')) {
        const targetUrl = cleanId.startsWith('http') ? cleanId : `${this.metadata.baseUrl}${cleanId}`;
        const html = await httpClient.fetchHtml(targetUrl);
        const item = this.parseDetailPage(html, targetUrl, cleanId);
        if (item) return item;
      }

      // 2. Query search by id/SKU
      const items = await this.search(cleanId);
      const match = items.find(
        (it) =>
          it.id === cleanId ||
          it.sku?.toLowerCase() === cleanId.toLowerCase() ||
          it.title.toLowerCase().includes(cleanId.toLowerCase())
      );

      return match || items[0] || null;
    } catch {
      return null;
    }
  }

  private extractTopCategoryUrl(html: string): string | null {
    try {
      const $ = httpClient.loadCheerio(html);
      const raw = $('script#__NEXT_DATA__').html();
      if (raw) {
        const parsed = JSON.parse(raw);
        const topResults = parsed?.props?.pageProps?.envelope?.data?.topResults;
        if (Array.isArray(topResults) && topResults.length > 0 && typeof topResults[0]?.categoryUrl === 'string') {
          return topResults[0].categoryUrl;
        }
      }

      // Fallback Cheerio: category links
      const firstCatLink = $('a[href*="/products/filter/"]').first().attr('href');
      return firstCatLink || null;
    } catch {
      return null;
    }
  }

  private parseHtmlOrNextData(html: string): ComponentItem[] {
    const items: ComponentItem[] = [];

    // Try parsing __NEXT_DATA__ JSON first (cleanest and richest)
    try {
      const $ = httpClient.loadCheerio(html);
      const raw = $('script#__NEXT_DATA__').html();
      if (raw) {
        const parsed = JSON.parse(raw);
        const products = parsed?.props?.pageProps?.envelope?.data?.products;
        if (Array.isArray(products) && products.length > 0) {
          for (const row of products) {
            if (!Array.isArray(row)) continue;
            const parsedItem = this.parseProductRow(row as DigiKeyProductCell[]);
            if (parsedItem) {
              items.push(parsedItem);
            }
          }
          if (items.length > 0) return items;
        }
      }
    } catch {
      // Fall through to Cheerio HTML table parsing
    }

    // Fallback: parse standard HTML table
    try {
      const $ = httpClient.loadCheerio(html);
      const self = this;
      $('table tbody tr').each((_, element) => {
        const rowEl = $(element);
        const productCell = rowEl.find('td[data-testid="draggable-cell--100"]').first();
        if (!productCell.length) return;

        const linkEl = productCell.find('a[href*="/products/detail/"]').first();
        const rawHref = linkEl.attr('href') || '';
        const fullUrl = rawHref.startsWith('http')
          ? rawHref
          : `${self.metadata.baseUrl}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

        const title = linkEl.text().trim() || productCell.text().trim();
        if (!title) return;

        // Id from URL or href
        const idMatch = rawHref.match(/\/(\d+)(?:\?|$)/);
        const id = idMatch ? idMatch[1] : title.slice(0, 32);

        // Price cell
        const priceCell = rowEl.find('td[data-testid="draggable-cell--101"]').first();
        const priceText = priceCell.text();
        const price = parseEurPrice(priceText) ?? 0;

        // Quantity / Stock cell
        const stockCell = rowEl.find('td[data-testid="draggable-cell--102"]').first();
        const stockText = stockCell.text().trim();
        const inStock = stockText.toLowerCase().includes('vorrätig') || /\d+/.test(stockText);

        const imgEl = rowEl.find('img').first();
        const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || '';
        const imageUrl = rawImg
          ? rawImg.startsWith('//')
            ? `https:${rawImg}`
            : rawImg.startsWith('http')
              ? rawImg
              : `${self.metadata.baseUrl}${rawImg}`
          : null;

        items.push({
          id,
          slug: `${self.metadata.id}:${id}`,
          shopId: self.metadata.id,
          shopName: self.metadata.name,
          title,
          brand: null,
          sku: null,
          price: roundEur(price),
          currency: 'EUR',
          formattedPrice: formatEur(price),
          url: fullUrl,
          imageUrl,
          inStock,
          stockDescription: stockText || (inStock ? 'Vorrätig' : 'Nicht vorrätig'),
          shippingEstimate: self.metadata.shippingPolicy.deliveryDays,
          category: null,
        });
      });
    } catch {
      // Return whatever we have
    }

    return items;
  }

  private parseProductRow(row: DigiKeyProductCell[]): ComponentItem | null {
    try {
      const compareCell = (row.find((c) => c.type === 'compare')?.value || {}) as Record<string, unknown>;
      const productDetailCell = (row.find((c) => c.type === 'productDetail')?.value || {}) as Record<string, unknown>;
      const unitPriceCell = row.find((c) => c.type === 'unitPrice')?.value;
      const qtyCell = row.find((c) => c.type === 'qtyAvailable')?.value;

      const productId =
        String(productDetailCell.productId || compareCell.productId || '').trim() ||
        String(compareCell.productNumber || '').trim();
      if (!productId) return null;

      const mfrPart = String(productDetailCell.productNumber || compareCell.manufacturerPartNumber || '').trim();

      let mfrName = '';
      if (typeof productDetailCell.manufacturer === 'object' && productDetailCell.manufacturer !== null) {
        const mObj = productDetailCell.manufacturer as Record<string, unknown>;
        if (typeof mObj.value === 'object' && mObj.value !== null) {
          const vObj = mObj.value as Record<string, unknown>;
          if (typeof vObj.label === 'string') mfrName = vObj.label;
        }
      }
      if (!mfrName && typeof compareCell.manufacturer === 'object' && compareCell.manufacturer !== null) {
        const cMfr = compareCell.manufacturer as Record<string, unknown>;
        if (typeof cMfr.name === 'string') mfrName = cMfr.name;
      }

      const description = String(productDetailCell.description || compareCell.shortDescription || '').trim();
      const titleParts = [mfrPart, mfrName, description].filter(Boolean);
      const title = titleParts.join(' - ') || mfrPart || productId;

      const detailUrlRaw = String(productDetailCell.detailUrl || '');
      const fullUrl = detailUrlRaw
        ? detailUrlRaw.startsWith('http')
          ? detailUrlRaw
          : `${this.metadata.baseUrl}${detailUrlRaw.startsWith('/') ? '' : '/'}${detailUrlRaw}`
        : `${this.metadata.baseUrl}/de/products/detail/${productId}`;

      // Price extraction: from unitPrice tier or compareCell
      let price = 0;
      if (Array.isArray(unitPriceCell) && unitPriceCell.length > 0) {
        const firstTier = unitPriceCell[0] as Record<string, unknown>;
        if (typeof firstTier.unitPrice === 'string') {
          price = parseEurPrice(firstTier.unitPrice) ?? 0;
        }
      }
      if (!price && compareCell.price) {
        price = parseEurPrice(String(compareCell.price)) ?? 0;
      }

      // Stock extraction
      let inStock = false;
      let stockDesc = 'Nicht vorrätig';
      if (Array.isArray(qtyCell) && qtyCell.length > 0) {
        const firstQty = qtyCell[0] as Record<string, unknown>;
        const qty = parseInt(String(firstQty.quantity || '0').replace(/\D/g, ''), 10);
        const label = String(firstQty.label || '').trim();
        inStock = qty > 0 || label.toLowerCase().includes('vorrätig');
        stockDesc = label
          ? `${qty > 0 ? `${qty} Stk. ` : ''}${label}`.trim()
          : inStock
            ? 'Vorrätig'
            : 'Nicht vorrätig';
      }

      // Image URL
      let rawImg = '';
      if (typeof productDetailCell.image === 'object' && productDetailCell.image !== null) {
        const imgObj = productDetailCell.image as Record<string, unknown>;
        if (typeof imgObj.standard === 'string') rawImg = imgObj.standard;
        else if (typeof imgObj.thumb === 'string') rawImg = imgObj.thumb;
      }
      if (!rawImg && typeof compareCell.iconImage === 'string') {
        rawImg = compareCell.iconImage;
      }

      let imageUrl: string | null = null;
      if (rawImg) {
        if (rawImg.startsWith('//')) {
          imageUrl = `https:${rawImg}`;
        } else if (rawImg.startsWith('http')) {
          imageUrl = rawImg;
        } else {
          imageUrl = `${this.metadata.baseUrl}${rawImg}`;
        }
      }

      return {
        id: productId,
        slug: `${this.metadata.id}:${productId}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: mfrName || null,
        sku: String(compareCell.productNumber || mfrPart || '') || null,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        url: fullUrl,
        imageUrl,
        inStock,
        stockDescription: stockDesc,
        shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
        category: null,
      };
    } catch {
      return null;
    }
  }

  private parseDetailPage(html: string, pageUrl: string, fallbackId: string): ComponentItem | null {
    try {
      const $ = httpClient.loadCheerio(html);
      const raw = $('script#__NEXT_DATA__').html();
      if (raw) {
        const parsed = JSON.parse(raw);
        const envelopeData = parsed?.props?.pageProps?.envelope?.data;
        if (envelopeData?.productOverview) {
          const po = envelopeData.productOverview as Record<string, unknown>;
          const pq = (envelopeData.priceQuantity || {}) as Record<string, unknown>;
          const vat = (pq.vat || {}) as Record<string, unknown>;
          const vatInc = (vat.vatTaxIncluded || {}) as Record<string, unknown>;
          const vatExc = (vat.vatTaxExcluded || {}) as Record<string, unknown>;

          const id = String(po.rolledUpProductId || fallbackId);
          const mfrPart = String(po.manufacturerProductNumber || '');
          const mfr = String(po.manufacturer || '');
          const title = String(po.title || `${mfrPart} ${mfr}`.trim() || id);

          let price = 0;
          if (typeof vatInc.unitPrice === 'string') {
            price = parseEurPrice(vatInc.unitPrice) ?? 0;
          } else if (typeof vatExc.unitPrice === 'string') {
            price = parseEurPrice(vatExc.unitPrice) ?? 0;
          }

          const qtyAvailable = Number(pq.quantityAvailable ?? pq.inStockQuantity ?? 0);
          const inStock = qtyAvailable > 0;
          const stockDesc =
            typeof pq.displayStockNotification === 'string'
              ? pq.displayStockNotification
              : inStock
                ? `${qtyAvailable} auf Lager`
                : 'Nicht vorrätig';

          let imageUrl: string | null = null;
          if (Array.isArray(envelopeData.carouselMedia) && envelopeData.carouselMedia.length > 0) {
            const firstMedia = envelopeData.carouselMedia[0] as Record<string, unknown>;
            const mediaUrl = String(firstMedia.displayUrl || firstMedia.smallPhoto || '');
            if (mediaUrl) {
              imageUrl = mediaUrl.startsWith('//') ? `https:${mediaUrl}` : mediaUrl;
            }
          }

          return {
            id,
            slug: `${this.metadata.id}:${id}`,
            shopId: this.metadata.id,
            shopName: this.metadata.name,
            title,
            brand: mfr || null,
            sku: mfrPart || String(po.rolledUpProductNumber || '') || null,
            price: roundEur(price),
            currency: 'EUR',
            formattedPrice: formatEur(price),
            url: pageUrl,
            imageUrl,
            inStock,
            stockDescription: stockDesc,
            shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
            category: null,
          };
        }
      }

      // Cheerio fallback
      const title = $('h1').first().text().trim() || $('title').text().trim();
      if (!title) return null;

      return {
        id: fallbackId,
        slug: `${this.metadata.id}:${fallbackId}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku: null,
        price: 0,
        currency: 'EUR',
        formattedPrice: formatEur(0),
        url: pageUrl,
        imageUrl: null,
        inStock: false,
        stockDescription: 'Unbekannt',
        shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
        category: null,
      };
    } catch {
      return null;
    }
  }
}
