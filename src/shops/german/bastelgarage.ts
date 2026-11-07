import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class BastelgarageShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'bastelgarage',
    name: 'Bastelgarage',
    region: 'de',
    countryCode: 'CH',
    supportedCountries: ['de', 'ch', 'li', 'at'],
    baseUrl: 'https://www.bastelgarage.ch',
    shippingPolicy: {
      standardCarrier: 'Swiss Post (PostPac International / auf Anfrage)',
      standardCost: 14.5,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '3-5 Werktage',
      policyUrl: 'https://www.bastelgarage.ch/lieferung-versandkosten',
      notes:
        'Versand aus der Schweiz (purecrea GmbH, Subingen). Versand nach Deutschland und ins Ausland erfolgt auf Anfrage über das Kontaktformular. Standardversand via Schweizer Post (Kleinwaren / PostPac International ca. 14,50 € / 14.50 CHF). Kostenlose Abholung vor Ort in Subingen möglich. Achtung: Bei Einfuhr in die EU können deutsche Einfuhrumsatzsteuer (19 %) und Zollabwicklungsgebühren anfallen.',
      defaultMethodId: 'swiss_post_international',
      pickupAvailable: true,
      pickupLocation: {
        name: 'purecrea GmbH / Bastelgarage Lager',
        address: 'Gewerbestrasse 23',
        postalCode: 'CH-4553',
        city: 'Subingen',
        country: 'CH',
        openingHours: 'Aktuelle Abholzeiten siehe bastelgarage.ch/oeffnungszeiten',
        instructions: 'Bestellung im Onlineshop aufgeben und Abholung vor Ort auswählen.',
      },
      methods: [
        {
          id: 'swiss_post_international',
          name: 'Schweizer Post International (nach DE auf Anfrage)',
          type: 'standard',
          carrier: 'Schweizer Post / DHL',
          cost: 14.5,
          freeShippingThreshold: null,
          deliveryDays: '3-5 Werktage',
          notes: 'Versand nach Deutschland auf Anfrage; zzgl. evtl. EU-Einfuhrabgaben.',
        },
        {
          id: 'pickup_subingen',
          name: 'Selbstabholung (Subingen SO, Schweiz)',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0,
          freeShippingThreshold: 0,
          deliveryDays: '1 Werktag',
          notes: 'Kostenlose Abholung im Lager Subingen (purecrea GmbH).',
          pickupLocation: {
            name: 'purecrea GmbH / Bastelgarage Lager',
            address: 'Gewerbestrasse 23',
            postalCode: 'CH-4553',
            city: 'Subingen',
            country: 'CH',
            openingHours: 'Aktuelle Abholzeiten siehe bastelgarage.ch/oeffnungszeiten',
            instructions: 'Bestellung im Onlineshop aufgeben und Abholung vor Ort auswählen.',
          },
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/index.php?route=product/search&search=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('.product-layout').each((_, element) => {
        const card = $(element);
        const titleEl = card.find('h4 a').first();
        const title = titleEl.text().trim();
        if (!title) return;

        const rawUrl = titleEl.attr('href') || card.find('.image a').first().attr('href') || '';
        const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${this.metadata.baseUrl}${rawUrl}`;

        const cartBtn = card.find('button[onclick*="cart.add"]').first();
        const cartOnClick = cartBtn.attr('onclick') || '';
        const cartMatch = cartOnClick.match(/cart\.add\('(\d+)'/);

        const urlMatch = fullUrl.match(/[?&]product_id=(\d+)/);
        const slugMatch = fullUrl.replace(/https?:\/\/[^/]+\//, '').split('?')[0];

        const id = cartMatch?.[1] || urlMatch?.[1] || slugMatch || title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 32);

        // Price parsing
        const priceEl = card.find('.price').first();
        let rawPriceText = '';
        const priceNew = priceEl.find('.price-new').first();
        if (priceNew.length > 0) {
          rawPriceText = priceNew.text().trim();
        } else {
          const clone = priceEl.clone();
          clone.find('.price-tax').remove();
          rawPriceText = clone.text().trim();
        }

        const price = parseEurPrice(rawPriceText) ?? 0;

        const imgEl = card.find('.image img').first();
        const imageUrl = imgEl.attr('src') || null;

        // Bastelgarage: alles was im Shop bestellbar ist, ist am Lager
        const inStock = true;
        const stockDescription = 'Ab Lager verfügbar';

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
          url: fullUrl,
          imageUrl,
          shippingEstimate: '3-5 Werktage',
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
      // If id is numeric product_id, fetch directly by product_id route
      const isNumeric = /^\d+$/.test(id);
      const url = isNumeric
        ? `${this.metadata.baseUrl}/index.php?route=product/product&product_id=${encodeURIComponent(id)}`
        : `${this.metadata.baseUrl}/${encodeURIComponent(id)}`;

      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const title = $('#content h1, h1').first().text().trim();
      if (!title || title.toLowerCase().includes('nicht gefunden') || title.toLowerCase().includes('not found')) {
        // Fallback to search by id
        const searchResults = await this.search(id, { limit: 1 });
        return searchResults[0] ?? null;
      }

      let manufacturer: string | null = null;
      let sku: string | null = null;
      let stockDescription = 'Ab Lager verfügbar';
      let inStock = true;

      $('#content ul.list-unstyled li').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('Hersteller')) {
          manufacturer = text.replace(/Hersteller\s*:?/i, '').trim() || null;
        } else if (text.includes('Artikelnr.')) {
          sku = text.replace(/Artikelnr\.\s*:?/i, '').trim() || null;
        } else if (text.includes('Verfügbarkeit')) {
          const avail = text.replace(/Verfügbarkeit\s*:?/i, '').trim();
          if (avail) {
            stockDescription = avail;
            inStock = avail.toLowerCase().includes('lager') || !avail.toLowerCase().includes('nicht');
          }
        }
      });

      let rawPrice = '';
      const priceUl = $('#content ul.list-unstyled')
        .filter((_, el) => $(el).text().includes('CHF'))
        .first();

      const priceNew = priceUl.find('.price-new, h2').first();
      if (priceNew.length > 0) {
        rawPrice = priceNew.text().trim();
      } else {
        rawPrice = priceUl.text().trim();
      }

      const price = parseEurPrice(rawPrice) ?? 0;

      const mainImg = $('#content .thumbnails a.thumbnail, #content .thumbnails img, #content img.img-responsive').first();
      const imageUrl = mainImg.attr('href') || mainImg.attr('src') || null;

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: manufacturer,
        sku,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription,
        url,
        imageUrl,
        shippingEstimate: '3-5 Werktage',
        category: null,
      };
    } catch {
      return null;
    }
  }
}
