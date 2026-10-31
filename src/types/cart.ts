import type { ShippingCalculation } from './shop.js';

export interface CartItem {
  slug: string;
  shopId: string;
  itemId: string;
  title: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  url: string;
  imageUrl: string | null;
}

export interface ShopCart {
  shopId: string;
  shopName: string;
  region: string;
  selectedShippingMethodId: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  shipping: ShippingCalculation;
  total: number;
  currency: 'EUR';
}

export interface CartSummary {
  carts: ShopCart[];
  totalItemCount: number;
  combinedSubtotal: number;
  combinedShipping: number;
  grandTotal: number;
  currency: 'EUR';
}
