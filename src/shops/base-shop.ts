import type { ComponentItem, SearchOptions } from '../types/component.js';
import type {
  ShippingCalculation,
  ShippingCalculationOptions,
  ShippingMethod,
  ShopAdapter,
  ShopMetadata,
} from '../types/shop.js';
import { roundEur } from '../utils/currency.js';

export abstract class BaseShopAdapter implements ShopAdapter {
  abstract readonly metadata: ShopMetadata;

  abstract search(query: string, options?: SearchOptions): Promise<ComponentItem[]>;

  abstract getById(id: string): Promise<ComponentItem | null>;

  async getBySlug(slug: string): Promise<ComponentItem | null> {
    const prefix = `${this.metadata.id}:`;
    const itemId = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
    return this.getById(itemId);
  }

  calculateShipping(
    subtotal: number,
    optionsOrCountry?: string | ShippingCalculationOptions
  ): ShippingCalculation {
    const policy = this.metadata.shippingPolicy;
    const roundedSubtotal = roundEur(subtotal);

    const options: ShippingCalculationOptions =
      typeof optionsOrCountry === 'string'
        ? { destinationCountry: optionsOrCountry }
        : optionsOrCountry || {};

    const availableMethods = policy.methods || [
      {
        id: 'standard',
        name: policy.standardCarrier,
        type: 'standard',
        carrier: policy.standardCarrier,
        cost: policy.standardCost,
        freeShippingThreshold: policy.freeShippingThreshold,
        deliveryDays: policy.deliveryDays,
        pickupLocation: policy.pickupLocation || null,
        notes: policy.notes,
      },
    ];

    let selectedMethod: ShippingMethod | undefined;

    if (options.methodId) {
      const target = options.methodId.toLowerCase();
      if (target === 'pickup') {
        selectedMethod = availableMethods.find(
          (m) => m.type === 'pickup' || m.id.toLowerCase().includes('pickup')
        );
      } else {
        selectedMethod = availableMethods.find(
          (m) => m.id.toLowerCase() === target || m.name.toLowerCase().includes(target)
        );
      }
    }

    if (!selectedMethod) {
      selectedMethod =
        availableMethods.find((m) => m.id === policy.defaultMethodId) ||
        availableMethods.find((m) => m.type === 'standard') ||
        availableMethods[0];
    }

    const isPickup = selectedMethod.type === 'pickup';
    const threshold = selectedMethod.freeShippingThreshold;

    let cost: number;
    let isFree: boolean;
    let remainingForFree: number | null;

    if (isPickup) {
      cost = 0;
      isFree = true;
      remainingForFree = 0;
    } else if (threshold !== null && roundedSubtotal >= threshold) {
      cost = 0;
      isFree = true;
      remainingForFree = 0;
    } else {
      cost = selectedMethod.cost;
      isFree = cost === 0;
      remainingForFree =
        threshold !== null ? roundEur(Math.max(0, threshold - roundedSubtotal)) : null;
    }

    const pickupLoc = selectedMethod.pickupLocation || (isPickup ? policy.pickupLocation : null);

    return {
      carrier: selectedMethod.carrier,
      methodId: selectedMethod.id,
      methodName: selectedMethod.name,
      type: selectedMethod.type,
      cost,
      isFree,
      isPickup,
      threshold,
      remainingForFree,
      pickupLocation: pickupLoc,
      availableMethods: availableMethods.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        carrier: m.carrier,
        cost: m.cost,
        freeShippingThreshold: m.freeShippingThreshold,
        isPickup: m.type === 'pickup',
      })),
      notes: isPickup
        ? `Selbstabholung: ${pickupLoc?.name ?? 'Store'} (${pickupLoc?.address ?? ''}, ${pickupLoc?.postalCode ?? ''} ${pickupLoc?.city ?? ''})`
        : isFree
          ? `${selectedMethod.name}: Versandkostenfrei (ab ${threshold} €)`
          : selectedMethod.notes || policy.notes,
    };
  }

  protected matchesFilters(item: ComponentItem, options?: SearchOptions): boolean {
    if (options?.inStockOnly && !item.inStock) {
      return false;
    }
    if (options?.minPrice !== undefined && item.price < options.minPrice) {
      return false;
    }
    if (options?.maxPrice !== undefined && item.price > options.maxPrice) {
      return false;
    }
    return true;
  }

  protected applyOptions(items: ComponentItem[], options?: SearchOptions): ComponentItem[] {
    const filtered = items.filter((item) => this.matchesFilters(item, options));
    const limit = options?.limit ?? 10;
    return filtered.slice(0, limit);
  }
}
