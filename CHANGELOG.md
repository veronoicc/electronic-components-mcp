# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-31

### Added
- Model Context Protocol (MCP) server for electronic component search, store price comparisons, and multi-store shopping cart management.
- Integration with 7 regional and global electronic component stores:
  - **BerryBase** (DE): DHL Paket (€4.95, free from €200), UPS Standard/Express Saver, local pickup in MakerSpace Berlin-Adlershof.
  - **Roboter-Bausatz** (DE): DHL Paket (€4.45, free from €99), DHL Express, local pickup in Lager Saarbrücken.
  - **Eckstein Komponente** (DE): DHL / DPD Paket (€6.50, free from €200), Warenpost (€2.60), local pickup in Clausthal-Zellerfeld.
  - **Watterott electronic** (DE): DHL Paket (€4.50, free from €100), DHL Express, local pickup in Leinefelde-Worbis.
  - **Antratek Deutschland** (DE): DPD / PostNL (€7.08 gross, free from €119), UPS Express.
  - **Botland** (DE): GLS Kurier (€4.99, free from €100), DHL Kurier, Hermes.
  - **AliExpress** (Global): Standard & Choice bundle (€2.99 base, free from €10), Premium Express.
- 11 MCP Tools:
  - `search_components`: Multi-store component search with keyword, price range, and in-stock filters.
  - `search_components_by_type`: Categorized component search across 13 standard electronics categories.
  - `get_component_by_slug`: Lookup components by composite slug (`${shopId}:${itemId}`).
  - `get_component_by_id`: Lookup components by specific shop identifier and store item ID.
  - `list_supported_shops`: List supported shops with shipping policies, pickup locations, and thresholds.
  - `cart_add_item`: Add components to per-store shopping carts.
  - `cart_update_item`: Update item quantities or remove with 0.
  - `cart_remove_item`: Remove items from cart.
  - `cart_set_shipping_method`: Select preferred shipping carrier or local pickup per store.
  - `cart_view`: Multi-store cart breakdown, shipping fees, pickup locations, and grand totals.
  - `cart_clear`: Clear single store cart or all carts.
- Local Pickup (Selbstabholung) support with zeroed shipping fees and physical store address/hours.
- Anti-bot resilient HTTP client using `impit` with real Chrome TLS fingerprinting (JA4) and HTTP/2 emulation.
- Automated CI and GitHub Actions release workflows for npm and GitHub Packages registries.
