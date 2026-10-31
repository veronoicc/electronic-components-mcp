import { describe, expect, it } from 'vitest';
import { BaseShopAdapter } from '../src/shops/base-shop.js';
import type { ComponentItem, SearchOptions } from '../src/types/component.js';
import type { ShopMetadata } from '../src/types/shop.js';
import { formatEur, parseEurPrice, roundEur } from '../src/utils/currency.js';

describe('Currency Utilities', () => {
  it('parses German EUR price formats accurately', () => {
    expect(parseEurPrice('12,50 €')).toBe(12.5);
    expect(parseEurPrice('€ 12,50')).toBe(12.5);
    expect(parseEurPrice('1.234,50 €')).toBe(1234.5);
    expect(parseEurPrice('ab 3,99 €')).toBe(3.99);
    expect(parseEurPrice('32,68 € inkl. MwSt.')).toBe(32.68);
    expect(parseEurPrice('0,15 €')).toBe(0.15);
  });

  it('parses standard decimal formats', () => {
    expect(parseEurPrice('12.99')).toBe(12.99);
    expect(parseEurPrice('€ 12.99')).toBe(12.99);
    expect(parseEurPrice('1,234.50')).toBe(1234.5);
  });

  it('handles empty and null values safely', () => {
    expect(parseEurPrice(null)).toBeNull();
    expect(parseEurPrice('')).toBeNull();
    expect(parseEurPrice('Not a price')).toBeNull();
  });

  it('formats EUR amounts consistently with German decimal commas', () => {
    expect(formatEur(12.5)).toBe('€ 12,50');
    expect(formatEur(0)).toBe('€ 0,00');
    expect(formatEur(1234.567)).toBe('€ 1234,57');
  });

  it('rounds amounts to 2 decimal places cleanly', () => {
    expect(roundEur(10.005)).toBe(10.01);
    expect(roundEur(10.12345)).toBe(10.12);
  });
});

describe('BaseShopAdapter Filter & Search Options', () => {
  class TestShopAdapter extends BaseShopAdapter {
    readonly metadata: ShopMetadata = {
      id: 'test',
      name: 'Test Shop',
      region: 'de',
      countryCode: 'DE',
      supportedCountries: ['de'],
      baseUrl: 'https://test.local',
      shippingPolicy: {
        standardCarrier: 'Test Post',
        standardCost: 5.0,
        freeShippingThreshold: 50.0,
        currency: 'EUR',
        deliveryDays: '1-2 days',
        policyUrl: 'https://test.local/shipping',
        notes: 'Test notes',
        methods: [],
        defaultMethodId: 'standard',
        pickupAvailable: false,
      },
    };

    public testApply(items: ComponentItem[], opts?: SearchOptions): ComponentItem[] {
      return this.applyOptions(items, opts);
    }

    async search(_query: string, _opts?: SearchOptions): Promise<ComponentItem[]> {
      return [];
    }

    async getById(_id: string): Promise<ComponentItem | null> {
      return null;
    }
  }

  const sampleItems: ComponentItem[] = [
    {
      id: '1',
      slug: 'test:1',
      shopId: 'test',
      shopName: 'Test Shop',
      title: 'Item 1',
      brand: null,
      sku: null,
      price: 5.0,
      currency: 'EUR',
      formattedPrice: '€ 5,00',
      inStock: true,
      stockDescription: 'In stock',
      url: 'https://test.local/1',
      imageUrl: null,
      shippingEstimate: null,
      category: null,
    },
    {
      id: '2',
      slug: 'test:2',
      shopId: 'test',
      shopName: 'Test Shop',
      title: 'Item 2',
      brand: null,
      sku: null,
      price: 15.0,
      currency: 'EUR',
      formattedPrice: '€ 15,00',
      inStock: false,
      stockDescription: 'Out of stock',
      url: 'https://test.local/2',
      imageUrl: null,
      shippingEstimate: null,
      category: null,
    },
    {
      id: '3',
      slug: 'test:3',
      shopId: 'test',
      shopName: 'Test Shop',
      title: 'Item 3',
      brand: null,
      sku: null,
      price: 30.0,
      currency: 'EUR',
      formattedPrice: '€ 30,00',
      inStock: true,
      stockDescription: 'In stock',
      url: 'https://test.local/3',
      imageUrl: null,
      shippingEstimate: null,
      category: null,
    },
  ];

  const adapter = new TestShopAdapter();

  it('filters by inStockOnly', () => {
    const res = adapter.testApply(sampleItems, { inStockOnly: true });
    expect(res.map((i) => i.id)).toEqual(['1', '3']);
  });

  it('filters by minPrice and maxPrice', () => {
    const res = adapter.testApply(sampleItems, { minPrice: 10, maxPrice: 20 });
    expect(res.map((i) => i.id)).toEqual(['2']);
  });

  it('respects limit', () => {
    const res = adapter.testApply(sampleItems, { limit: 2 });
    expect(res.length).toBe(2);
  });
});
