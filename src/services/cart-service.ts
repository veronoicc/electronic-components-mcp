import { shopRegistry, ShopRegistry } from '../registry/shop-registry.js';
import type { CartItem, CartSummary, ShopCart } from '../types/cart.js';
import type { ComponentItem } from '../types/component.js';
import type { ShippingCalculationOptions } from '../types/shop.js';
import { roundEur } from '../utils/currency.js';
import { searchService, SearchService } from './search-service.js';

export class CartService {
  private carts = new Map<string, Map<string, CartItem>>();
  private selectedMethods = new Map<string, string>();

  constructor(
    private registry: ShopRegistry = shopRegistry,
    private search: SearchService = searchService
  ) {}

  /**
   * Adds an item to the store's cart by slug.
   * If item details are provided directly (e.g. from a search hit), they are used;
   * otherwise, the component is retrieved via the search service.
   */
  async addItem(slug: string, quantity = 1, itemData?: ComponentItem): Promise<CartItem> {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    const [shopId, itemId] = slug.split(':');
    if (!shopId || !itemId) {
      throw new Error(`Invalid slug format: "${slug}". Expected "shopId:itemId"`);
    }

    const shop = this.registry.getShop(shopId);
    if (!shop) {
      throw new Error(`Shop "${shopId}" not recognized`);
    }

    let shopCart = this.carts.get(shopId);
    if (!shopCart) {
      shopCart = new Map();
      this.carts.set(shopId, shopCart);
    }

    const existing = shopCart.get(slug);
    if (existing) {
      existing.quantity += quantity;
      existing.subtotal = roundEur(existing.unitPrice * existing.quantity);
      return existing;
    }

    let component = itemData;
    if (!component) {
      const fetched = await this.search.getBySlug(slug);
      if (fetched) {
        component = fetched;
      }
    }

    const unitPrice = component?.price ?? 0;
    const title = component?.title ?? itemId;
    const url = component?.url ?? `${shop.metadata.baseUrl}`;
    const imageUrl = component?.imageUrl ?? null;

    const newItem: CartItem = {
      slug,
      shopId,
      itemId,
      title,
      unitPrice,
      quantity,
      subtotal: roundEur(unitPrice * quantity),
      url,
      imageUrl,
    };

    shopCart.set(slug, newItem);
    return newItem;
  }

  /**
   * Updates an item's quantity. If quantity is 0 or negative, the item is removed.
   */
  async updateItem(slug: string, quantity: number): Promise<CartItem | null> {
    const [shopId] = slug.split(':');
    const shopCart = this.carts.get(shopId);
    if (!shopCart || !shopCart.has(slug)) {
      throw new Error(`Item "${slug}" not found in cart`);
    }

    if (quantity <= 0) {
      shopCart.delete(slug);
      return null;
    }

    const item = shopCart.get(slug)!;
    item.quantity = Math.floor(quantity);
    item.subtotal = roundEur(item.unitPrice * item.quantity);
    return item;
  }

  /**
   * Removes an item from the cart.
   */
  removeItem(slug: string): boolean {
    const [shopId] = slug.split(':');
    const shopCart = this.carts.get(shopId);
    if (!shopCart) return false;
    return shopCart.delete(slug);
  }

  /**
   * Sets the preferred shipping method (or 'pickup') for a specific store.
   */
  setShippingMethod(shopId: string, methodId: string): ShopCart {
    const normalizedShopId = shopId.toLowerCase();
    const shop = this.registry.getShop(normalizedShopId);
    if (!shop) {
      throw new Error(`Shop "${shopId}" not found`);
    }

    this.selectedMethods.set(normalizedShopId, methodId);
    const cart = this.getCart(normalizedShopId, { methodId });
    if (!cart) {
      throw new Error(`Failed to calculate cart for "${shopId}"`);
    }
    return cart;
  }

  /**
   * Clears the cart for a specific shop, or all shops if shopId is omitted.
   */
  clear(shopId?: string): void {
    if (shopId) {
      const normalized = shopId.toLowerCase();
      this.carts.delete(normalized);
      this.selectedMethods.delete(normalized);
    } else {
      this.carts.clear();
      this.selectedMethods.clear();
    }
  }

  /**
   * Returns calculated cart details for a specific shop.
   */
  getCart(
    shopId: string,
    optionsOrCountry?: string | ShippingCalculationOptions
  ): ShopCart | null {
    const normalizedShopId = shopId.toLowerCase();
    const shop = this.registry.getShop(normalizedShopId);
    if (!shop) {
      return null;
    }

    const options: ShippingCalculationOptions =
      typeof optionsOrCountry === 'string'
        ? { destinationCountry: optionsOrCountry }
        : optionsOrCountry || {};

    const methodId = options.methodId || this.selectedMethods.get(normalizedShopId);

    const shopCart = this.carts.get(normalizedShopId);
    const items = shopCart ? Array.from(shopCart.values()) : [];

    const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
    const subtotal = roundEur(items.reduce((acc, item) => acc + item.subtotal, 0));

    const shipping = shop.calculateShipping(subtotal, {
      destinationCountry: options.destinationCountry ?? 'de',
      methodId,
    });
    const total = roundEur(subtotal + shipping.cost);

    return {
      shopId: shop.metadata.id,
      shopName: shop.metadata.name,
      region: shop.metadata.region,
      selectedShippingMethodId: shipping.methodId,
      items,
      itemCount,
      subtotal,
      shipping,
      total,
      currency: 'EUR',
    };
  }

  /**
   * Returns a complete multi-store summary across all shops with active items.
   */
  getAllCarts(destinationCountry = 'de'): CartSummary {
    const carts: ShopCart[] = [];
    let totalItemCount = 0;
    let combinedSubtotal = 0;
    let combinedShipping = 0;

    for (const shop of this.registry.getAllShops()) {
      const cart = this.getCart(shop.metadata.id, { destinationCountry });
      if (cart && cart.itemCount > 0) {
        carts.push(cart);
        totalItemCount += cart.itemCount;
        combinedSubtotal = roundEur(combinedSubtotal + cart.subtotal);
        combinedShipping = roundEur(combinedShipping + cart.shipping.cost);
      }
    }

    const grandTotal = roundEur(combinedSubtotal + combinedShipping);

    return {
      carts,
      totalItemCount,
      combinedSubtotal,
      combinedShipping,
      grandTotal,
      currency: 'EUR',
    };
  }
}

export const cartService = new CartService();
