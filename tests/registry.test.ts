import { describe, expect, it } from 'vitest';
import { buildCategoryQuery, CATEGORY_DEFINITIONS } from '../src/registry/category-registry.js';
import { ShopRegistry } from '../src/registry/shop-registry.js';
import { registerAllShops } from '../src/shops/index.js';
import type { ComponentItem, SearchOptions } from '../src/types/component.js';
import type { ShippingCalculation, ShopAdapter, ShopMetadata } from '../src/types/shop.js';

describe('ShopRegistry', () => {
  it('implements default country rule: empty or undefined returns global only', () => {
    const registry = new ShopRegistry();
    registerAllShops(registry);

    const defaultShops = registry.getShopsForCountries();
    expect(defaultShops.map((s) => s.metadata.id)).toEqual(['aliexpress']);

    const emptyShops = registry.getShopsForCountries([]);
    expect(emptyShops.map((s) => s.metadata.id)).toEqual(['aliexpress']);
  });

  it('filters German stores when ["de"] is specified', () => {
    const registry = new ShopRegistry();
    registerAllShops(registry);

    const deShops = registry.getShopsForCountries(['de']);
    const ids = deShops.map((s) => s.metadata.id).sort();
    expect(ids).toEqual(['antratek', 'berrybase', 'botland', 'eckstein', 'roboter-bausatz', 'watterott']);
  });

  it('filters both German and Global stores when ["de", "global"] is specified', () => {
    const registry = new ShopRegistry();
    registerAllShops(registry);

    const all = registry.getShopsForCountries(['de', 'global']);
    const ids = all.map((s) => s.metadata.id).sort();
    expect(ids).toEqual(['aliexpress', 'antratek', 'berrybase', 'botland', 'eckstein', 'roboter-bausatz', 'watterott']);
  });

  it('is extensible: newly registered country surfaces immediately without code changes', () => {
    const registry = new ShopRegistry();
    registerAllShops(registry);

    const mockUsShop: ShopAdapter = {
      metadata: {
        id: 'sparkfun',
        name: 'SparkFun Electronics',
        region: 'us',
        countryCode: 'US',
        supportedCountries: ['us', 'ca'],
        baseUrl: 'https://www.sparkfun.com',
        shippingPolicy: {
          standardCarrier: 'USPS Ground',
          standardCost: 5.0,
          freeShippingThreshold: 100.0,
          currency: 'EUR',
          deliveryDays: '3-5 days',
          policyUrl: 'https://www.sparkfun.com/shipping',
          notes: 'US shipping',
          methods: [],
          defaultMethodId: 'standard',
          pickupAvailable: false,
        },
      },
      search: async (_q: string, _opts?: SearchOptions): Promise<ComponentItem[]> => [],
      getById: async (_id: string): Promise<ComponentItem | null> => null,
      getBySlug: async (_s: string): Promise<ComponentItem | null> => null,
      calculateShipping: (_subtotal: number): ShippingCalculation => ({
        carrier: 'USPS Ground',
        methodId: 'standard',
        methodName: 'USPS Ground',
        type: 'standard',
        cost: 5.0,
        isFree: false,
        isPickup: false,
        threshold: 100.0,
        remainingForFree: 100.0,
        notes: 'US shipping',
      }),
    };

    registry.register(mockUsShop);

    const usShops = registry.getShopsForCountries(['us']);
    expect(usShops.map((s) => s.metadata.id)).toEqual(['sparkfun']);
  });
});

describe('CategoryRegistry', () => {
  it('contains all 13 required component categories', () => {
    const expected = [
      'capacitor',
      'resistor',
      'inductor',
      'diode',
      'transistor',
      'ic',
      'microcontroller',
      'sensor',
      'relay',
      'display',
      'power_supply',
      'motor_driver',
      'connector',
    ];

    for (const cat of expected) {
      expect(CATEGORY_DEFINITIONS[cat as keyof typeof CATEGORY_DEFINITIONS]).toBeDefined();
    }
  });

  it('builds category queries with primary keywords and specs', () => {
    expect(buildCategoryQuery('capacitor', '100uF 25V', 'de')).toBe('Kondensator 100uF 25V');
    expect(buildCategoryQuery('microcontroller', 'ESP32-S3', 'global')).toBe('Microcontroller ESP32-S3');
    expect(buildCategoryQuery('resistor', undefined, 'de')).toBe('Widerstand');
  });

  it('avoids keyword duplication when specs already contain the primary keyword', () => {
    expect(buildCategoryQuery('capacitor', 'Keramik Kondensator 100nF', 'de')).toBe(
      'Keramik Kondensator 100nF'
    );
  });
});
