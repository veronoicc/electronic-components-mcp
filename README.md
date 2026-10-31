# electronic-components-mcp

Model Context Protocol (MCP) server for electronic components. Search components across diverse regional stores (German shops and global sellers like AliExpress), look up items by slug or category, and manage multi-store shopping carts with accurate shipping calculations, alternative shipping carriers, free-shipping threshold qualification, and local pickup support.

## Supported Stores

| Store | Region | Standard Carrier | Base Cost | Free Shipping Threshold | Pickup Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BerryBase** | `de` | DHL Paket | €4.95 | **€200.00** | Berlin (Gustav-Adolf-Str. 129, 13086 Berlin) |
| **Roboter-Bausatz** | `de` | DHL Paket | €4.45 | **€99.00** | Bad Bentheim (Heinrich-Böll-Str. 6, 48455 Bad Bentheim) |
| **Eckstein Komponente** | `de` | DHL Paket | €4.90 | **€79.00** | Clausthal-Zellerfeld (Am Galgensberg 18, 38678 Clausthal-Zellerfeld) |
| **Watterott electronic** | `de` | DHL Paket | €4.50 | **€100.00** | Leinefelde-Worbis (Herderstr. 10, 37327 Leinefelde-Worbis) |
| **Antratek Deutschland** | `de` | DPD / PostNL | €7.08 gross | **€119.00** gross | Mail order dispatch |
| **Botland** | `de` | GLS Kurier | €4.99 | **€100.00** | Mail order dispatch |
| **AliExpress** | `global` | Choice / Standard | €2.99 fallback | **€10.00** (Choice bundle) | Standard home delivery |

## Features

- **Local Pickup (Selbstabholung)**:
  - Select pickup for stores with physical locations (BerryBase Berlin, Roboter-Bausatz Bad Bentheim, Eckstein Clausthal-Zellerfeld, Watterott Leinefelde-Worbis).
  - Automatically zeros shipping fees (€0.00) and displays store address, opening hours, and pickup instructions.
- **Alternative Shipping Methods**:
  - Choose between available carriers per shop: DHL Paket, UPS Standard, UPS Express Saver, DPD, GLS, Deutsche Post Warensendung, etc.
- **Anti-Bot Resilience**: Uses `impit` with real Chrome TLS fingerprinting (JA4) and HTTP/2 emulation, falling back gracefully to standard fetch.
- **Country / Region Routing**:
  - Default (`undefined` or `[]`): Global stores only (`AliExpress`).
  - `['de']`: German stores only (`BerryBase`, `Roboter-Bausatz`, `Eckstein`, `Watterott`, `Antratek`, `Botland`).
  - `['de', 'global']`: All stores.
  - Extensible: add new country adapters without touching service or tool logic.
- **Component Category Search**:
  - Standard categories (`capacitor`, `resistor`, `inductor`, `diode`, `transistor`, `ic`, `microcontroller`, `sensor`, `relay`, `display`, `power_supply`, `motor_driver`, `connector`).
  - Automatic German and English keyword generation based on target store region.
- **Multi-Store Shopping Cart**:
  - Independent carts per store identified by slug composite (`shopId:itemId`).
  - Automatic shipping calculation and free shipping threshold tracking (`remainingForFree`).
  - Aggregate multi-store checkout summary (`combinedSubtotal`, `combinedShipping`, `grandTotal`).

## Quick Start

### Build & Test

```bash
pnpm install
pnpm build
pnpm test
```

### Run Server

```bash
node dist/index.js
```

Or run directly with tsx during development:

```bash
pnpm dev
```

## Available MCP Tools (11)

1. `search_components`: Multi-store keyword search with country, price, and stock filters.
   - `query`: Search string (e.g. `'esp32'`, `'bme280'`).
   - `countries`: Optional region filter (e.g. `['de']`, `['global']`, `['de', 'global']`).
   - `limit`: Max items per shop (default 10).
   - `min_price`, `max_price`, `in_stock_only`: Optional filters.
2. `search_components_by_type`: Search by structured component type and specs.
   - `type`: Component category (e.g. `'capacitor'`, `'microcontroller'`).
   - `subtype_or_specs`: Optional rating or subtype (e.g. `'100uF 25V'`, `'ESP32-S3'`).
   - `countries`, `limit`, `min_price`, `max_price`, `in_stock_only`.
3. `get_component_by_slug`: Retrieve item details by slug (e.g. `'berrybase:019e91c53143712ea7b9a942fd9f419c'`).
4. `get_component_by_id`: Retrieve item details by store ID and store's internal item ID.
5. `list_supported_shops`: List supported shops with shipping methods, pickup locations, and thresholds.
6. `cart_add_item`: Add item to store cart with quantity.
7. `cart_update_item`: Update item quantity (0 to remove).
8. `cart_remove_item`: Remove item from cart.
9. `cart_set_shipping_method`: Set preferred shipping or pickup method for a store (e.g. `"pickup"`, `"dhl"`, `"ups_express"`).
10. `cart_view`: View single shop cart or all active carts with shipping methods, pickup details, and threshold progress.
11. `cart_clear`: Clear items from a specific shop or all shops.

## License

MIT
