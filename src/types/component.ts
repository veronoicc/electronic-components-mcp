export interface ComponentItem {
  id: string;
  slug: string; // composite `${shopId}:${id}`
  shopId: string;
  shopName: string;
  title: string;
  brand: string | null;
  sku: string | null;
  price: number; // EUR value, e.g. 12.50
  currency: 'EUR';
  formattedPrice: string; // e.g. "€ 12,50"
  inStock: boolean;
  stockDescription: string | null;
  url: string;
  imageUrl: string | null;
  shippingEstimate: string | null;
  category: string | null;
}

export interface SearchOptions {
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
}

export interface ComponentSearchFilters {
  query?: string;
  type?: string;
  subtypeOrSpecs?: string;
  countries?: string[];
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
}
