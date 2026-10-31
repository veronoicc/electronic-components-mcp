import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { COMPONENT_CATEGORIES } from '../registry/category-registry.js';
import { shopRegistry } from '../registry/shop-registry.js';
import { cartService } from '../services/cart-service.js';
import { searchService } from '../services/search-service.js';

export function registerTools(server: McpServer): void {
  server.tool(
    'search_components',
    'Search electronic components across registered online stores by keyword or part name',
    {
      query: z
        .string()
        .describe("Search term, e.g. 'esp32', 'ne555', 'bme280', '10k resistor'"),
      countries: z
        .array(z.string())
        .optional()
        .describe("Country/region codes, e.g. ['de'], ['global'], ['de', 'global']. Default: global only"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Max items to retrieve per shop (default 10)'),
      min_price: z.number().optional().describe('Minimum price in EUR'),
      max_price: z.number().optional().describe('Maximum price in EUR'),
      in_stock_only: z.boolean().optional().default(false).describe('Only return items currently in stock'),
    },
    async (args) => {
      try {
        const items = await searchService.search({
          query: args.query,
          countries: args.countries,
          limit: args.limit,
          minPrice: args.min_price,
          maxPrice: args.max_price,
          inStockOnly: args.in_stock_only,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: items.length,
                  results: items,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Search error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'search_components_by_type',
    'Search electronic components by structured component category and optional ratings/specs',
    {
      type: z
        .enum(COMPONENT_CATEGORIES)
        .describe("Component category, e.g. 'capacitor', 'microcontroller', 'sensor'"),
      subtype_or_specs: z
        .string()
        .optional()
        .describe("Optional specifications or subtype, e.g. '100uF 50V' or 'ESP32-S3'"),
      countries: z
        .array(z.string())
        .optional()
        .describe("Country/region codes, e.g. ['de'], ['global']. Default: global only"),
      limit: z.number().int().min(1).max(50).optional().default(10),
      min_price: z.number().optional().describe('Minimum price in EUR'),
      max_price: z.number().optional().describe('Maximum price in EUR'),
      in_stock_only: z.boolean().optional().default(false),
    },
    async (args) => {
      try {
        const items = await searchService.search({
          type: args.type,
          subtypeOrSpecs: args.subtype_or_specs,
          countries: args.countries,
          limit: args.limit,
          minPrice: args.min_price,
          maxPrice: args.max_price,
          inStockOnly: args.in_stock_only,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  category: args.type,
                  specs: args.subtype_or_specs ?? null,
                  count: items.length,
                  results: items,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Category search error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'get_component_by_slug',
    'Retrieve exact component details using a composite slug',
    {
      slug: z
        .string()
        .describe("Component slug in format 'shopId:itemId', e.g. 'berrybase:019e91c53143712ea7b9a942fd9f419c'"),
    },
    async (args) => {
      try {
        const item = await searchService.getBySlug(args.slug);
        if (!item) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Component with slug "${args.slug}" not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Lookup error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'get_component_by_id',
    "Retrieve component details using a specific store identifier and store's internal item ID",
    {
      shop: z
        .string()
        .describe("Shop identifier ('berrybase', 'roboter-bausatz', 'antratek', 'botland', 'eckstein', 'watterott', 'aliexpress')"),
      item_id: z.string().describe("Store's native item ID or URL path"),
    },
    async (args) => {
      try {
        const item = await searchService.getById(args.shop, args.item_id);
        if (!item) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Component with ID "${args.item_id}" not found in shop "${args.shop}"`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(item, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Lookup error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'list_supported_shops',
    'List all registered electronic component stores with their shipping policies and supported regions',
    {
      countries: z
        .array(z.string())
        .optional()
        .describe("Filter shops by country/region, e.g. ['de']"),
    },
    async (args) => {
      const metadata = shopRegistry.listShopsMetadata(args.countries);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: metadata.length,
                shops: metadata,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'cart_add_item',
    'Add an electronic component to the store shopping cart',
    {
      slug: z.string().describe("Component slug ('shopId:itemId')"),
      quantity: z.number().int().min(1).default(1).describe('Quantity to add (default 1)'),
    },
    async (args) => {
      try {
        const item = await cartService.addItem(args.slug, args.quantity);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Added ${args.quantity}x "${item.title}" to ${item.shopId} cart`,
                  item,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to add item to cart: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'cart_update_item',
    'Update the quantity of an item in the shopping cart (0 to remove)',
    {
      slug: z.string().describe("Component slug ('shopId:itemId')"),
      quantity: z.number().int().min(0).describe('New quantity (0 to remove item)'),
    },
    async (args) => {
      try {
        const item = await cartService.updateItem(args.slug, args.quantity);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: item
                    ? `Updated quantity to ${args.quantity}`
                    : `Removed "${args.slug}" from cart`,
                  item,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to update cart: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'cart_remove_item',
    'Remove an item completely from the shopping cart',
    {
      slug: z.string().describe("Component slug ('shopId:itemId')"),
    },
    async (args) => {
      const removed = cartService.removeItem(args.slug);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: removed,
                message: removed
                  ? `Removed "${args.slug}" from cart`
                  : `Item "${args.slug}" was not found in cart`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'cart_set_shipping_method',
    'Select a specific shipping or pickup method for a store cart (e.g. "pickup", "dhl", "ups_express")',
    {
      shop: z
        .string()
        .describe("Shop identifier ('berrybase', 'roboter-bausatz', 'antratek', 'botland', 'eckstein', 'watterott', 'aliexpress')"),
      shipping_method: z
        .string()
        .describe('Shipping method ID (e.g. "pickup", "dhl", "ups_standard", "ups_express", etc.)'),
    },
    async (args) => {
      try {
        const updatedCart = cartService.setShippingMethod(args.shop, args.shipping_method);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Set shipping method for ${args.shop} to "${updatedCart.shipping.methodName}"`,
                  cart: updatedCart,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to set shipping method: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'cart_view',
    'View the current shopping cart with shipping costs, pickup locations, free shipping thresholds, and grand totals',
    {
      shop: z
        .string()
        .optional()
        .describe('Optional shop ID to view a single store cart. Omit to view all store carts.'),
      shipping_method: z
        .string()
        .optional()
        .describe('Optional shipping method ID or "pickup" to preview shipping calculations'),
      country_destination: z
        .string()
        .optional()
        .default('de')
        .describe("Shipping destination country code (default 'de')"),
    },
    async (args) => {
      if (args.shop) {
        const cart = cartService.getCart(args.shop, {
          destinationCountry: args.country_destination,
          methodId: args.shipping_method,
        });
        if (!cart) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Shop "${args.shop}" not found`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      }

      const summary = cartService.getAllCarts(args.country_destination);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'cart_clear',
    'Clear items from shopping cart for a specific shop or all shops',
    {
      shop: z.string().optional().describe('Optional shop ID to clear. Omit to clear all carts.'),
    },
    async (args) => {
      cartService.clear(args.shop);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: args.shop
                  ? `Cleared cart for shop "${args.shop}"`
                  : 'Cleared all shopping carts',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
