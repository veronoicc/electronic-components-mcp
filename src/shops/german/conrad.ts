import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class ConradShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'conrad',
    name: 'Conrad Electronic',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'at', 'ch', 'eu'],
    baseUrl: 'https://www.conrad.de',
    shippingPolicy: {
      standardCarrier: 'DHL / Hermes',
      standardCost: 4.95,
      freeShippingThreshold: 100.0,
      currency: 'EUR',
      deliveryDays: '1-3 Werktage',
      policyUrl: 'https://support.conrad.de/hc/de/articles/49577913672977-Versandkosten-f%C3%BCr-Conrad-Artikel-B2C',
      notes: 'Standardversand 4,95 € (versandkostenfrei ab 100,00 € für Privat- und Geschäftskunden). Expresslieferung 24h für 15,90 € (unter 100 €) bzw. 10,95 € (ab 100 €). Kostenlose Filialabholung (Click & Collect).',
      defaultMethodId: 'standard',
      pickupAvailable: true,
      pickupLocation: {
        name: 'Conrad Filialen (Click & Collect)',
        address: 'Deutschlandweit in teilnehmenden Conrad Filialen',
        city: 'Deutschland',
        postalCode: '92242',
        country: 'DE',
        instructions: 'Kostenlose Abholung in Conrad Filialen bei lokaler Verfügbarkeit.',
      },
      methods: [
        {
          id: 'standard',
          name: 'Standardversand (DHL / Hermes)',
          type: 'standard',
          carrier: 'DHL / Hermes',
          cost: 4.95,
          freeShippingThreshold: 100.0,
          deliveryDays: '1-3 Werktage',
          notes: 'Standard Paketversand mit DHL oder Hermes.',
        },
        {
          id: 'express',
          name: 'Expressversand (24h)',
          type: 'express',
          carrier: 'DHL Express',
          cost: 15.90,
          freeShippingThreshold: null,
          deliveryDays: '1 Werktag',
          notes: 'Lieferung am nächsten Werktag bei Bestellung vor 18:00 Uhr.',
        },
        {
          id: 'pickup',
          name: 'Filialabholung (Click & Collect)',
          type: 'pickup',
          carrier: 'Selbstabholung',
          cost: 0.0,
          freeShippingThreshold: 0.0,
          deliveryDays: 'Sofort / 1-2 Werktage',
          notes: 'Kostenlose Abholung in teilnehmenden Filialen.',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/de/search.html?search=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('article[data-purpose="product-card"]').each((_, cardEl) => {
        try {
          const card = $(cardEl);
          const id = (card.attr('data-product-id') || '').trim();
          if (!id) return;

          const linkEl = card.find('a[href*="/p/"]').first();
          const href = linkEl.attr('href') || '';
          const productUrl = href.startsWith('http')
            ? href
            : `${this.metadata.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

          const titleEl = card.find('a[title]').first();
          const title = (
            titleEl.attr('title') ||
            card.find('h2').first().text() ||
            linkEl.text()
          ).trim();

          if (!title) return;

          // Find price
          let rawPriceText = '';
          card.find('span').each((_, span) => {
            const t = $(span).text().trim();
            if (t.includes('€') && /\d/.test(t) && !rawPriceText) {
              rawPriceText = t;
            }
          });

          const price = parseEurPrice(rawPriceText);
          if (price === null) return;

          const image = card.find('img').first().attr('src') || null;

          // Availability
          const stockEl = card.find('.ccp-availability-stock').first();
          const labelEl = card.find('.ccp-availability-label').first();
          const cardText = card.text();

          const stockDescription = stockEl.text().trim() || labelEl.text().trim() || null;
          const inStock =
            cardText.includes('auf Lager') ||
            cardText.includes('Sofort-Lieferung') ||
            cardText.includes('Lieferbar');

          const shippingEstimate = labelEl.text().trim() || this.metadata.shippingPolicy.deliveryDays;

          items.push({
            id,
            slug: `${this.metadata.id}:${id}`,
            shopId: this.metadata.id,
            shopName: this.metadata.name,
            title,
            brand: null,
            sku: id,
            price: roundEur(price),
            currency: 'EUR',
            formattedPrice: formatEur(price),
            inStock,
            stockDescription,
            url: productUrl,
            imageUrl: image,
            shippingEstimate,
            category: null,
          });
        } catch {
          // ignore single item parsing error
        }
      });

      return this.applyOptions(items, options);
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<ComponentItem | null> {
    try {
      // First try direct product detail by ID (conrad returns redirect HTML)
      const directUrl = `${this.metadata.baseUrl}/de/p/${encodeURIComponent(id)}.html`;
      let html = await httpClient.fetchHtml(directUrl);

      // Check if redirected via meta refresh
      const redirectMatch = html.match(/url=([^"'\s>]+)/i);
      let targetUrl = directUrl;
      if (redirectMatch && redirectMatch[1]) {
        const dest = redirectMatch[1];
        targetUrl = dest.startsWith('http')
          ? dest
          : `${this.metadata.baseUrl}${dest.startsWith('/') ? '' : '/'}${dest}`;
        html = await httpClient.fetchHtml(targetUrl);
      }

      const $ = httpClient.loadCheerio(html);
      const title = $('h1').first().text().trim();

      if (!title) {
        // Fallback to searching by id
        const results = await this.search(id);
        const match = results.find((item) => item.id === id);
        return match ?? null;
      }

      let rawPriceText = '';
      $('[data-purpose*="price"], span, div').each((_, el) => {
        const t = $(el).clone().children().remove().end().text().trim();
        if (t.includes('€') && /\d+,\d{2}/.test(t) && !rawPriceText) {
          rawPriceText = t;
        }
      });

      const price = parseEurPrice(rawPriceText);
      if (price === null) return null;

      const image =
        $('img[src*="asset.conrad.com"]').first().attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        null;

      const pageText = $('body').text();
      const inStock =
        pageText.includes('auf Lager') ||
        pageText.includes('Sofort-Lieferung') ||
        pageText.includes('Lieferbar');

      const stockDesc =
        $('.ccp-availability-stock').first().text().trim() ||
        $('.ccp-availability-label').first().text().trim() ||
        (inStock ? 'Auf Lager' : 'Nicht auf Lager');

      return {
        id,
        slug: `${this.metadata.id}:${id}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku: id,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription: stockDesc,
        url: targetUrl,
        imageUrl: image,
        shippingEstimate: this.metadata.shippingPolicy.deliveryDays,
        category: null,
      };
    } catch {
      return null;
    }
  }
}
