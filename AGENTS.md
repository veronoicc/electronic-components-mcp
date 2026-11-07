# Repository Guidelines

## Project Overview

`@veronoicc/electronic-components-mcp` is a Model Context Protocol (MCP) server that provides electronic component discovery, pricing comparisons, and multi-store shopping cart management. It connects AI assistants via standard I/O (stdio) to regional German retailers (BerryBase, Roboter-Bausatz, Eckstein Komponente, Watterott electronic, Antratek Deutschland, Botland) and global suppliers (AliExpress Choice/Standard).

Key capabilities include:
- Cross-store keyword and structured category searches.
- Composite slug resolution (`${shopId}:${itemId}`).
- Isolated per-store cart management with shipping costs, free-shipping thresholds, carrier selection (DHL, UPS, DPD, GLS), and local storefront pickup (`Selbstabholung`).
- Anti-bot resilient scraping using `impit` with Chrome JA4 TLS fingerprinting and standard `fetch` fallback.

---

## Architecture & Data Flow

The server follows a layered architecture with registry-based shop adapters and service-level orchestration:

```
               [MCP Client / Host]
                        │  stdio (JSON-RPC)
                        ▼
             [McpServer (src/index.ts)]
                        │
                        ▼
          [Tool Layer (src/tools/register-tools.ts)]
             │                            │
             ▼                            ▼
  [SearchService (services/)]     [CartService (services/)]
             │                            │
             ▼                            ▼
   [ShopRegistry (registry/)]       [Shop Carts]
             │
     ┌───────┴────────────────────────┐
     ▼                                ▼
[German Adapters (shops/german/)]  [Global Adapters (shops/global/)]
     └───────┬────────────────────────┘
             ▼
   [BaseShopAdapter (shops/base-shop.ts)]
             │
             ▼
   [HttpClient (utils/http-client.ts) (impit / fetch)]
```

- **Server & Protocol Layer (`src/index.ts`)**: Boots `McpServer`, sets up `StdioServerTransport`, registers shop adapters into the global `shopRegistry`, and binds all MCP tools.
- **Tool Layer (`src/tools/register-tools.ts`)**: Validates input arguments using Zod schemas, delegates to services, and wraps outputs in structured MCP tool responses.
- **Service Layer (`src/services/`)**:
  - `SearchService`: Queries multiple shop adapters concurrently via `Promise.allSettled`, isolates failures, and applies post-filtering (price, stock, limits).
  - `CartService`: Tracks items per store, recalculates item subtotals, shipping rules, free-shipping margins, and active carrier methods.
- **Registry Layer (`src/registry/`)**:
  - `ShopRegistry`: Registers adapters and queries them by shop identifier or supported country code (`de`, `global`).
  - `CategoryRegistry`: Maps standardized component categories (resistors, microcontrollers, sensors, etc.) to store-specific search terms.
- **Adapter Layer (`src/shops/`)**:
  - `BaseShopAdapter`: Abstract base class implementing shared filter pipelines (`applyFilters`), composite slug creation, and shipping calculation engines.
  - Concrete adapters (`src/shops/german/*.ts`, `src/shops/global/*.ts`): Implement store-specific scraping/API parsing via `cheerio` and `HttpClient`.

---

## Key Directories

- `src/`: Main TypeScript source code.
  - `src/types/`: Central type definitions (`component.ts`, `shop.ts`, `cart.ts`).
  - `src/registry/`: Adapter and category registration singletons (`shop-registry.ts`, `category-registry.ts`).
  - `src/services/`: Core business logic (`search-service.ts`, `cart-service.ts`).
  - `src/shops/`: Shop adapter implementations (`base-shop.ts`, `german/`, `global/`).
  - `src/tools/`: MCP tool definitions and registrations (`register-tools.ts`).
  - `src/utils/`: Networking (`http-client.ts`) and data formatting (`currency.ts`).
- `tests/`: Vitest test suites and validation scripts.
- `dist/`: Compiled ESM output, declaration files (`.d.ts`), and source maps (generated via build).

---

## Development Commands

All commands use `pnpm`:

```bash
# Install dependencies
pnpm install

# Run the server in development mode (stdio via tsx)
pnpm dev

# Typecheck codebase without emitting files
pnpm typecheck

# Run unit and integration tests with Vitest
pnpm test

# Build production bundle to dist/
pnpm build

# Start production build from dist/
pnpm start

# Run full pre-publish validation pipeline (typecheck + test + build)
pnpm prepublishOnly

# Run live smoke test against external store endpoints
pnpm exec tsx tests/live-smoke.ts
```

---

## Code Conventions & Common Patterns

### 1. TypeScript & ESM Import Paths
- NodeNext ESM is enforced: **all local module imports MUST include the `.js` extension**, even when authoring `.ts` files:
  ```ts
  import { cartService } from '../services/cart-service.js';
  import type { ComponentItem } from '../types/component.js';
  ```
- Use `import type` when importing types to avoid importing runtime code.

### 2. Tool Registration & Argument Validation
- Every tool is defined in `src/tools/register-tools.ts` using `server.tool(name, description, schema, handler)`.
- Use `zod` for all parameter validation. Every property MUST include `.describe(...)` explaining its purpose and format to LLMs:
  ```ts
  query: z.string().describe("Search term, e.g. 'esp32', 'bme280'"),
  countries: z.array(z.string()).optional().describe("e.g. ['de'], ['global']"),
  limit: z.number().int().min(1).max(50).optional().default(10),
  ```

### 3. Error Handling
- MCP tools must never throw uncaught exceptions to the client transport. Always wrap handler logic in `try / catch` blocks and return `{ isError: true, content: [{ type: 'text', text: ... }] }`:
  ```ts
  try {
    const result = await someOperation();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: unknown) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error executing operation: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
  ```
- Cross-shop search uses `Promise.allSettled` to guarantee that if one external shop scraper fails or times out, successful results from other stores still return.

### 4. Dependency Injection & State Management
- Services and registries export both their class (for isolated unit testing) and a default singleton instance (for runtime usage):
  ```ts
  export class ShopRegistry { ... }
  export const shopRegistry = new ShopRegistry();
  ```
- In tests, always instantiate fresh classes in `beforeEach` to prevent cross-test state leakage.

### 5. Composite Slugs & Store Identifiers
- Unique items across shops are addressed using composite slugs with the pattern `${shopId}:${itemId}`:
  ```ts
  const slug = `${shop.id}:${item.id}`; // e.g. "berrybase:12345"
  ```
- `BaseShopAdapter.splitSlug(slug)` extracts `{ shopId, itemId }`.

### 6. Currency & Numbers
- Currency amounts are in EUR. Always use `roundEur(value)` from `src/utils/currency.ts` to avoid floating-point math issues before storing or comparing monetary values.

### 7. Network Requests & Anti-Bot Scraping
- Always use `HttpClient` (`src/utils/http-client.ts`) for outbound HTTP requests rather than raw `fetch`. It manages user-agent rotations, headers, retry handling, and uses `impit` with JA4 TLS fingerprinting to bypass anti-bot challenges on shop frontends.

---

## Important Files

- `src/index.ts`: Executable entry point; configures stdio transport and boots the MCP server.
- `src/tools/register-tools.ts`: Tool registrations for all 11 MCP tools (`search_components`, `cart_*`, `get_component_*`, `list_supported_shops`).
- `src/shops/base-shop.ts`: Core abstract class for all store adapters; encapsulates shipping calculation, filter application, and slug helpers.
- `src/services/search-service.ts`: Cross-shop parallel search coordinator.
- `src/services/cart-service.ts`: Multi-store cart calculations and state manager.
- `src/registry/shop-registry.ts`: Catalog of registered store adapters.
- `src/utils/http-client.ts`: Resilient HTTP client wrapper around `impit` and `fetch`.
- `package.json`: Scripts, module type definition (`type: "module"`), dependencies, and binary mapping.
- `tsconfig.json`: TypeScript compiler options (`NodeNext`, strict mode, output to `dist/`).

---

## Runtime/Tooling Preferences

- **Runtime**: Node.js `>=20.0.0` (native ESM required). Tested against Node 20.x and Node 22.x.
- **Package Manager**: `pnpm` (lockfile: `pnpm-lock.yaml`). Do not commit `package-lock.json` or `yarn.lock`.
- **Development Tooling**: `tsx` for direct TypeScript execution without compilation.
- **Build System**: TypeScript compiler (`tsc`) targeting `ES2022` with `NodeNext` module resolution.
- **MCP Protocol**: Built with `@modelcontextprotocol/sdk` (v1.32+).

---

## Testing & QA

- **Framework**: Vitest (`^3.0.7`) executed via `pnpm test` (`vitest run`).
- **Test Locations & Naming**:
  - Test files reside in `tests/` and follow the `*.test.ts` naming convention.
  - Integration/smoke scripts are also located in `tests/` (e.g. `tests/live-smoke.ts`).
- **Testing Conventions**:
  - **Shipping Calculations**: Test exact costs, threshold edge cases (under, at, and over free-shipping threshold), carrier overrides, and pickup options (`tests/cart-service.test.ts`).
  - **Shop Adapters**: Test common filter rules (`inStockOnly`, `minPrice`, `maxPrice`, `limit`) via dummy adapters extending `BaseShopAdapter` (`tests/shop-adapters.test.ts`).
  - **Registry**: Verify shop adapter registration and country code lookups (`tests/registry.test.ts`).
- **Pre-Commit / Pre-Publish Quality Gate**:
  - Must pass `pnpm run typecheck` (`tsc --noEmit`).
  - Must pass `pnpm run test` (`vitest run`).
  - Must pass `pnpm run build` (`tsc`).
