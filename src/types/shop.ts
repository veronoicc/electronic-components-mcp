import type { ComponentItem, SearchOptions } from './component.js';

export type ShippingType = 'standard' | 'express' | 'pickup' | 'economy';

export interface PickupLocation {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  openingHours?: string;
  instructions?: string;
}

export interface ShippingMethod {
  id: string; // e.g. 'dhl', 'pickup_berlin', 'ups_standard', 'ups_express'
  name: string; // e.g. 'DHL Paket', 'Selbstabholung (Berlin Store)', 'UPS Standard'
  type: ShippingType;
  carrier: string; // e.g. 'DHL', 'Selbstabholung', 'UPS', 'GLS', 'DPD'
  cost: number; // EUR gross
  freeShippingThreshold: number | null; // EUR gross or null if no threshold
  deliveryDays: string;
  pickupLocation?: PickupLocation | null;
  notes?: string;
}

export interface ShippingPolicy {
  standardCarrier: string;
  standardCost: number; // EUR gross
  freeShippingThreshold: number | null; // EUR gross or null if no threshold
  currency: 'EUR';
  deliveryDays: string;
  policyUrl: string;
  notes: string;
  methods: ShippingMethod[];
  defaultMethodId: string;
  pickupAvailable: boolean;
  pickupLocation?: PickupLocation | null;
}

export interface ShippingCalculationOptions {
  destinationCountry?: string;
  methodId?: string; // specific method ID or 'pickup'
}

export interface ShippingCalculation {
  carrier: string;
  methodId: string;
  methodName: string;
  type: ShippingType;
  cost: number;
  isFree: boolean;
  isPickup: boolean;
  threshold: number | null;
  remainingForFree: number | null;
  pickupLocation?: PickupLocation | null;
  availableMethods?: Array<{
    id: string;
    name: string;
    type: ShippingType;
    carrier: string;
    cost: number;
    freeShippingThreshold: number | null;
    isPickup: boolean;
  }>;
  notes: string;
}

export interface ShopMetadata {
  id: string;
  name: string;
  region: 'de' | 'global' | string;
  countryCode: 'DE' | 'GLOBAL' | string;
  supportedCountries: string[];
  baseUrl: string;
  shippingPolicy: ShippingPolicy;
}

export interface ShopAdapter {
  readonly metadata: ShopMetadata;
  search(query: string, options?: SearchOptions): Promise<ComponentItem[]>;
  getById(id: string): Promise<ComponentItem | null>;
  getBySlug(slug: string): Promise<ComponentItem | null>;
  calculateShipping(
    subtotal: number,
    optionsOrCountry?: string | ShippingCalculationOptions
  ): ShippingCalculation;
}
