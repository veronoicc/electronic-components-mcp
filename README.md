# @veronoicc/electronic-components-mcp

Model Context Protocol (MCP) server for electronic components. Search components across diverse regional stores (German shops and global sellers like AliExpress), look up items by slug or category, and manage multi-store shopping carts with accurate shipping calculations, alternative shipping carriers, free-shipping threshold qualification, and local pickup support.

## Supported Stores

| Store | Region | Standard Carrier | Base Cost | Free Shipping Threshold | Pickup Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BerryBase** | `de` | DHL Paket | €4.95 | **€200.00** | MakerSpace Berlin-Adlershof (Am Studio 20d, 12489 Berlin) |
| **Roboter-Bausatz** | `de` | DHL Paket | €4.45 | **€99.00** | Lager Saarbrücken (Römerstadt 2-4, 66121 Saarbrücken) |
| **Eckstein Komponente** | `de` | DHL Paket | €6.50 | **€200.00** | Clausthal-Zellerfeld (Am Ostbahnhof 3, 38678 Clausthal-Zellerfeld) |
| **Watterott electronic** | `de` | DHL Paket | €4.50 | **€100.00** | Leinefelde-Worbis (Breitenhölzer Str. 6, 37327 Leinefelde-Worbis) |
| **Antratek Deutschland** | `de` | DPD / PostNL | €7.08 gross | **€119.00** gross | Mail order dispatch |
| **Botland** | `de` | GLS Kurier | €4.99 | **€100.00** | Mail order dispatch |
| **EXP Tech** | `de` | UPS Standard | €6.50 | None | Mail order dispatch |
| **Paradisetronic** | `de` | DHL-Kleinpaket | €3.50 | **€40.00** | Berlin-Reinickendorf (Breitenbachstr. 24, 13509 Berlin) |
| **Welectron** | `de` | DHL / DPD Paket | €4.95 | **€49.00** (DPD) / **€99.00** (DHL) | Mail order dispatch |
| **AZ-Delivery** | `de` | DHL / Deutsche Post | €3.90 | **€25.00** | Mail order dispatch |
| **Makershop** | `de` | Deutsche Post / DHL | €2.50 | **€10.00** | Mail order dispatch |
| **Komputer.de** | `de` | Deutsche Post / DHL | €3.50 | None | Mail order dispatch |
| **Funduino** | `de` | DHL Paket | €4.90 | None | Mail order dispatch |
| **Bastelgarage** | `de` | Swiss Post / PostPac | €14.50 | None | Subingen (Gewerbestrasse 23, CH-4553 Subingen) |
| **Reichelt Elektronik** | `de` | DHL Paket | €5.95 | None | Sande (Elektronikring 1, 26452 Sande) |
| **Conrad Electronic** | `de` | DHL / Hermes | €4.95 | **€100.00** | Filialabholung (Click & Collect deutschlandweit) |
| **Pollin Electronic** | `de` | DHL Paket | €5.99 | None | Pförring (Max-Pollin-Straße 1, 85104 Pförring) |
| **ELV Elektronik** | `de` | DHL / GLS | €3.99 | **€39.00** | Mail order dispatch |
| **Mouser Electronics** | `de` | UPS / FedEx / DHL Express | €20.00 | **€50.00** net (€59.50 gross) | Mail order dispatch (DDP) |
| **DigiKey** | `de` | UPS / FedEx | €25.00 | **€75.00** | Mail order dispatch (DDP) |
| **Farnell** | `de` | UPS / DHL Express | €11.99 | **€75.00** net | Mail order dispatch |
| **Bürklin Elektronik** | `de` | UPS Standard | €8.21 gross | None | Oberhaching (Grünwalder Weg 30, 82041 Oberhaching) |
| **TME** | `de` | DHL Paket / GLS | €9.40 gross | None | Mail order dispatch |
| **AliExpress** | `global` | Choice / Standard | €2.99 fallback | **€10.00** (Choice bundle) | Standard home delivery |

## Features

- **Local Pickup (Selbstabholung)**:
  - Select pickup for stores with physical locations (BerryBase MakerSpace Berlin-Adlershof, Roboter-Bausatz Saarbrücken, Eckstein Clausthal-Zellerfeld, Watterott Leinefelde-Worbis).
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

Via npx:

```bash
npx -y @veronoicc/electronic-components-mcp
```

From source:

```bash
pnpm install
pnpm build
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
