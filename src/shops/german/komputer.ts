import type { ComponentItem, SearchOptions } from '../../types/component.js';
import type { ShopMetadata } from '../../types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../../utils/currency.js';
import { httpClient } from '../../utils/http-client.js';
import { BaseShopAdapter } from '../base-shop.js';

export class KomputerShopAdapter extends BaseShopAdapter {
  readonly metadata: ShopMetadata = {
    id: 'komputer',
    name: 'Komputer.de',
    region: 'de',
    countryCode: 'DE',
    supportedCountries: ['de', 'eu'],
    baseUrl: 'https://www.komputer.de/zen',
    shippingPolicy: {
      standardCarrier: 'Deutsche Post / DHL',
      standardCost: 3.5,
      freeShippingThreshold: null,
      currency: 'EUR',
      deliveryDays: '1-2 Werktage',
      policyUrl: 'https://www.komputer.de/zen/index.php?main_page=shippinginfo',
      notes:
        'Versand innerhalb Deutschlands: 3,50 € (Großbrief, Einschreiben, Päckchen, Paket per Deutsche Post / DHL). EU-Versand 7,00 €. Bei Bestellungen Mo-Fr bis 15:00 Uhr, Sa bis 10:00 Uhr Versand am selben Tag. In der Regel Zustellung am nächsten/übernächsten Werktag.',
      defaultMethodId: 'standard',
      pickupAvailable: false,
      methods: [
        {
          id: 'standard',
          name: 'Deutsche Post / DHL Standardversand',
          type: 'standard',
          carrier: 'Deutsche Post / DHL',
          cost: 3.5,
          freeShippingThreshold: null,
          deliveryDays: '1-2 Werktage',
          notes: 'Großbrief, Einschreiben, Päckchen oder Paket per Deutsche Post / DHL',
        },
      ],
    },
  };

  async search(query: string, options?: SearchOptions): Promise<ComponentItem[]> {
    try {
      const url = `${this.metadata.baseUrl}/index.php?main_page=advanced_search_result&search_in_description=1&keyword=${encodeURIComponent(query)}`;
      const html = await httpClient.fetchHtml(url);
      const $ = httpClient.loadCheerio(html);

      const items: ComponentItem[] = [];

      $('.centerBoxContentsProducts').each((_, element) => {
        const card = $(element);
        const titleLink = card.find('h3.itemTitle a, .itemTitle a').first();
        const title = titleLink.text().trim();
        if (!title) return;

        const href = titleLink.attr('href') || '';
        const fullUrl = href.startsWith('http') ? href : `${this.metadata.baseUrl}/${href.replace(/^\//, '')}`;

        const idMatch = href.match(/products_id=([0-9]+)/);
        const id = idMatch ? idMatch[1] : '';
        if (!id) return;

        const priceText = card.find('.list-price .productBasePrice, .productBasePrice').first().text().trim();
        const price = parseEurPrice(priceText);
        if (price === null) return;

        const imgEl = card.find('.list-image img, img.listingProductImage').first();
        const imgSrc = imgEl.attr('src');
        const imageUrl = imgSrc
          ? imgSrc.startsWith('http')
            ? imgSrc
            : `${this.metadata.baseUrl}/${imgSrc.replace(/^\//, '')}`
          : null;

        const inStock = true;
        const stockDescription = 'Auf Lager';

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
          shippingEstimate: '1-2 Werktage',
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
      const cleanId = id.replace(/^[a-z0-9_-]+:/i, '').trim();
      const productUrl = `${this.metadata.baseUrl}/index.php?main_page=product_info&products_id=${encodeURIComponent(cleanId)}`;

      const html = await httpClient.fetchHtml(productUrl);
      const $ = httpClient.loadCheerio(html);

      const nameEl = $('#productName');
      const title = nameEl.text().trim();
      if (!title) return null;

      const priceText = $('#productPrices .productBasePrice, #productPrices').first().text().trim();
      const price = parseEurPrice(priceText);
      if (price === null) return null;

      // Extract image: can be in noscript or script block in #productMainImage
      const noscriptHtml = $('#productMainImage noscript').html() || '';
      let imgSrc = $('#productMainImage img').attr('src');
      if (!imgSrc && noscriptHtml) {
        const match = noscriptHtml.match(/src=["']([^"']+)["']/i);
        if (match) imgSrc = match[1];
      }
      if (!imgSrc) {
        const scriptText = $('#productMainImage script').text();
        const match = scriptText.match(/src=\\?["']([^"'\\]+)\\?["']/i);
        if (match) imgSrc = match[1];
      }

      const imageUrl = imgSrc
        ? imgSrc.startsWith('http')
          ? imgSrc
          : `${this.metadata.baseUrl}/${imgSrc.replace(/^\//, '')}`
        : null;

      let sku: string | null = null;
      let inStock = true;
      let stockDescription = 'Auf Lager';

      $('#productDetailsList li').each((_, el) => {
        const text = $(el).text().trim();
        const skuMatch = text.match(/Artikelnummer:\s*([^\s]+)/i);
        if (skuMatch) {
          sku = skuMatch[1];
        }

        if (text.toLowerCase().includes('lager') || text.toLowerCase().includes('stück')) {
          stockDescription = text;
          if (text.toLowerCase().includes('nicht') || text.startsWith('0')) {
            inStock = false;
          }
        }
      });

      return {
        id: cleanId,
        slug: `${this.metadata.id}:${cleanId}`,
        shopId: this.metadata.id,
        shopName: this.metadata.name,
        title,
        brand: null,
        sku,
        price: roundEur(price),
        currency: 'EUR',
        formattedPrice: formatEur(price),
        inStock,
        stockDescription,
        url: productUrl,
        imageUrl,
        shippingEstimate: '1-2 Werktage',
        category: null,
      };
    } catch {
      return null;
    }
  }
}
