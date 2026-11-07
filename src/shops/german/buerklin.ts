import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

interface BuerklinJentisProduct {
  id?: string;
  name?: string;
  brutto?: number;
  netto?: number;
  currency?: string;
  stock_info?: string;
  stock?: number;
  brand?: string;
  group?: string[];
  imageuri?: string;
}

interface SchemaOrgProduct {
  name?: string;
  sku?: string;
  mpn?: string;
  url?: string;
  image?: string;
  brand?: {
    name?: string;
  };
  offers?: {
    price?: number | string;
    availability?: string;
    priceSpecification?: {
      price?: number | string;
    };
  };
}

export class BuerklinShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'buerklin',
    name: 'Bürklin Elektronik',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.buerklin.com',
    shippingPolicy: {
      standardCarrier: 'UPS Standard',
      standardCost: 8.21, // 6,90 € zzgl. MwSt. = 8,21 € inkl. MwSt.
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1 Arbeitstag',
      policyUrl: 'https://www.buerklin.com/de/support/versand/',
      notes: 'UPS Standard: 6,90 € zzgl. MwSt. (8,21 € inkl. MwSt.). UPS Express Saver: 7,90 € zzgl. MwSt. (9,40 € inkl. MwSt.). Kostenlose 24/7 Selbstabholung an der Abholstation in Oberhaching bei München.',
      defaultMethodId: 'ups_standard',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Bürklin Elektronik 24/7 Abholstation',
        address: 'Grünwalder Weg 30 (Parkplatz vor dem Haupteingang)',
        city: 'Oberhaching',
        postalCode: '82041',
        country: 'DE',
        openingHours: '24/7 rund um die Uhr verfügbar',
        instructions: 'Abholung an der Abholstation mit QR-Code aus der Benachrichtigungs-E-Mail (Aufbewahrung für 7 Tage).',
      },
      methods: [
        {
          id: 'ups_standard',
          name: 'UPS Standard',
          type: 'standard',
          carrier: 'UPS',
          cost: 8.21,
          freeShippingThreshold: null,
          deliveryDays: '1 Arbeitstag',
          notes: 'Standardversand innerhalb Deutschlands am nächsten Arbeitstag bei Bestellung Mo-Fr bis 18:00 Uhr (6,90 € zzgl. MwSt. / 8,21 € inkl. MwSt.)',
        },
        {
          id: 'ups_express',
          name: 'UPS Express Saver',
          type: 'express',
          carrier: 'UPS',
          cost: 9.40,
          freeShippingThreshold: null,
          deliveryDays: '1 Arbeitstag (Zustellung nächster Werktag garantiert)',
          notes: 'Expresszustellung am nächsten Arbeitstag (7,90 € zzgl. MwSt. / 9,40 € inkl. MwSt.)',
        },
        {
          id: 'pickup_oberhaching',
          name: '24/7 Abholstation Oberhaching',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Nach Bereitstellung (24/7 Abholung)',
          pickupLocation: {
            name: 'Bürklin Elektronik 24/7 Abholstation',
            address: 'Grünwalder Weg 30 (Parkplatz vor dem Haupteingang)',
            city: 'Oberhaching',
            postalCode: '82041',
            country: 'DE',
            openingHours: '24/7 rund um die Uhr verfügbar',
            instructions: 'Abholung an der Abholstation mit QR-Code aus der Benachrichtigungs-E-Mail (Aufbewahrung für 7 Tage).',
          },
          notes: 'Kostenlose persönliche Abholung an der 24/7 Abholstation in Oberhaching bei München.',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const searchUrl = `${this.metadata.baseUrl}/de/suche/${encodeURIComponent(query)}/`;
      const html = await httpClient.fetchHtml(searchUrl);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('article.product-list-item').each((_, element) => {
        const article = $(element);

        // Parse structured tracking data if present
        let jentisData: BuerklinJentisProduct = {};
        const rawJentis = article.attr('data-jentis-product-list-click');
        if (rawJentis) {
          try {
            jentisData = JSON.parse(rawJentis) as BuerklinJentisProduct;
          } catch {
            // ignore JSON error, fallback to DOM
          }
        }

        const linkEl = article.find('a.product-link').first();
        const rawHref = linkEl.attr('href') || '';
        const url = rawHref.startsWith('http') ? rawHref : `${this.metadata.baseUrl}${rawHref}`;

        const skuAttr = linkEl.attr('data-sku');
        const id = jentisData.id || skuAttr || (rawHref.match(/\/([A-Za-z0-9]+)\/?$/) || [])[1] || '';
        if (!id && !url) return;

        const title = jentisData.name || linkEl.text().replace(/\s+/g, ' ').trim();
        if (!title) return;

        // Price parsing: brutto (incl. VAT) preferred, with DOM fallback
        let price = jentisData.brutto !== undefined ? roundEur(jentisData.brutto) : 0;
        if (!price) {
          const rawPriceText = article.find('.scale-of-prices-item-price').first().text();
          price = parseEurPrice(rawPriceText) ?? 0;
        }

        // Image URL
        let imageUrl: string | null = jentisData.imageuri || null;
        if (!imageUrl) {
          const imgEl = article.find('.product-list-image img').first();
          const src = imgEl.attr('src') || null;
          if (src) {
            imageUrl = src.startsWith('http') ? src : `${this.metadata.baseUrl}${src}`;
          }
        }

        // Availability and stock
        const availText = article.find('.product-list-item-availability').text().replace(/\s+/g, ' ').trim();
        let inStock = false;
        let stockDescription = availText || 'Lieferzeit auf Anfrage';

        if (jentisData.stock !== undefined && jentisData.stock > 0) {
          inStock = true;
          stockDescription = `Auf Lager: ${jentisData.stock} Stk.`;
        } else if (
          availText.toLowerCase().includes('sofort verfügbar') ||
          availText.toLowerCase().includes('ab lager') ||
          availText.toLowerCase().includes('verfügbar in')
        ) {
          inStock = true;
        }

        const brand = jentisData.brand || null;
        const category = Array.isArray(jentisData.group) && jentisData.group.length > 0
          ? jentisData.group.join(' > ')
          : null;

        items.push({
          id,
          slug: `${this.metadata.id}:${id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand,
          sku: skuAttr || id,
          price,
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription,
          url,
          imageUrl,
          shippingEstimate: '1 Arbeitstag',
          category,
        });
      });

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      let targetUrl = id.startsWith('http')
        ? id
        : `${this.metadata.baseUrl}/de/suche/${encodeURIComponent(id)}/`;

      // If resolving via search and not direct product path, follow redirect if single SKU match
      if (!targetUrl.includes('/de/p/')) {
        try {
          const clientWithImpit = httpClient as unknown as { impitClient?: { fetch: (url: string, opts?: { redirect?: string }) => Promise<{ headers: { get: (name: string) => string | null } }> } };
          if (clientWithImpit.impitClient) {
            const res = await clientWithImpit.impitClient.fetch(targetUrl, { redirect: 'manual' });
            const loc = res.headers.get('location');
            if (loc) {
              targetUrl = loc.replace(/^http:\/\//, 'https://');
            }
          }
        } catch {
          // ignore redirect check error
        }
      }

      const html = await httpClient.fetchHtml(targetUrl);
      const $ = httpClient.loadCheerio(html);

      // Check if page contains schema.org Product JSON-LD (direct product page)
      let schemaProduct: SchemaOrgProduct | null = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const text = $(el).text();
          const parsed: unknown = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && '@type' in parsed && parsed['@type'] === 'Product') {
            schemaProduct = parsed as SchemaOrgProduct;
          }
        } catch {
          // ignore
        }
      });

      if (schemaProduct) {
        const p: SchemaOrgProduct = schemaProduct;
        const title = p.name || $('h1').first().text().trim();
        const sku = p.sku || id;
        const offer = p.offers || {};
        const priceSpec = offer.priceSpecification || {};
        const rawPrice = priceSpec.price ?? offer.price;
        const price = typeof rawPrice === 'number'
          ? roundEur(rawPrice)
          : typeof rawPrice === 'string'
            ? parseEurPrice(rawPrice) ?? 0
            : 0;

        const canonicalUrl = p.url || $('link[rel="canonical"]').attr('href') || targetUrl;
        const fullUrl = canonicalUrl.startsWith('http') ? canonicalUrl : `${this.metadata.baseUrl}${canonicalUrl}`;
        const imageUrl = p.image || null;
        const brand = p.brand?.name || null;
        const inStock = offer.availability?.includes('InStock') ?? false;

        return {
          id: sku || id,
          slug: `${this.metadata.id}:${sku || id}`,
          shopId: this.metadata.id,
          shopName: this.metadata.name,
          title,
          brand,
          sku,
          price,
          currency: 'EUR',
          formattedPrice: formatEur(price),
          inStock,
          stockDescription: inStock ? 'Sofort verfügbar' : 'Lieferzeit auf Anfrage',
          url: fullUrl,
          imageUrl,
          shippingEstimate: '1 Arbeitstag',
          category: null,
        };
      }

      // Fallback: if search returned a list, grab first result
      const searchResults = await this.search(id, { limit: 1 });
      return searchResults[0] ?? null;
    } catch {
      return null;
    }
  }
}
