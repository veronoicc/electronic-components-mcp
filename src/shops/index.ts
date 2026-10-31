import type { ShopRegistry } from '../registry/shop-registry.js';
import { AntratekShopAdapter } from './german/antratek.js';
import { BerrybaseShopAdapter } from './german/berrybase.js';
import { BotlandShopAdapter } from './german/botland.js';
import { EcksteinShopAdapter } from './german/eckstein.js';
import { RoboterBausatzShopAdapter } from './german/roboter-bausatz.js';
import { WatterottShopAdapter } from './german/watterott.js';
import { AliexpressShopAdapter } from './global/aliexpress.js';

export * from './base-shop.js';
export * from './german/berrybase.js';
export * from './german/roboter-bausatz.js';
export * from './german/antratek.js';
export * from './german/botland.js';
export * from './german/eckstein.js';
export * from './german/watterott.js';
export * from './global/aliexpress.js';

/**
 * Registers all built-in shop adapters into the provided or global shop registry.
 */
export function registerAllShops(registry: ShopRegistry): void {
  registry.register(new BerrybaseShopAdapter());
  registry.register(new RoboterBausatzShopAdapter());
  registry.register(new AntratekShopAdapter());
  registry.register(new BotlandShopAdapter());
  registry.register(new EcksteinShopAdapter());
  registry.register(new WatterottShopAdapter());
  registry.register(new AliexpressShopAdapter());
}
