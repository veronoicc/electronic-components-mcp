import { beforeEach, describe, expect, it } from 'vitest';
import { ShopRegistry } from '../src/registry/shop-registry.js';
import { CartService } from '../src/services/cart-service.js';
import { SearchService } from '../src/services/search-service.js';
import { registerAllShops } from '../src/shops/index.js';
import type { ComponentItem } from '../src/types/component.js';

describe('Shop Shipping Rules Calculation', () => {
  let registry: ShopRegistry;

  beforeEach(() => {
    registry = new ShopRegistry();
    registerAllShops(registry);
  });

  it('BerryBase: €4.95 standard shipping, free from €200.00', () => {
    const shop = registry.getShop('berrybase')!;

    // Under threshold
    const under = shop.calculateShipping(50.0);
    expect(under.cost).toBe(4.95);
    expect(under.isFree).toBe(false);
    expect(under.remainingForFree).toBe(150.0);
    expect(under.carrier).toBe('DHL Paket');

    // Exactly at threshold
    const at = shop.calculateShipping(200.0);
    expect(at.cost).toBe(0.0);
    expect(at.isFree).toBe(true);
    expect(at.remainingForFree).toBe(0.0);

    // Over threshold
    const over = shop.calculateShipping(250.0);
    expect(over.cost).toBe(0.0);
    expect(over.isFree).toBe(true);
  });

  it('Roboter-Bausatz: €4.45 standard shipping, free from €99.00', () => {
    const shop = registry.getShop('roboter-bausatz')!;

    // Under threshold
    const under = shop.calculateShipping(49.0);
    expect(under.cost).toBe(4.45);
    expect(under.isFree).toBe(false);
    expect(under.remainingForFree).toBe(50.0);
    expect(under.carrier).toBe('DHL Paket');

    // Exactly at threshold
    const at = shop.calculateShipping(99.0);
    expect(at.cost).toBe(0.0);
    expect(at.isFree).toBe(true);
    expect(at.remainingForFree).toBe(0.0);

    // Over threshold
    const over = shop.calculateShipping(120.0);
    expect(over.cost).toBe(0.0);
    expect(over.isFree).toBe(true);
  });

  it('Antratek: €7.08 standard shipping, free from €119.00', () => {
    const shop = registry.getShop('antratek')!;

    // Under threshold
    const under = shop.calculateShipping(100.0);
    expect(under.cost).toBe(7.08);
    expect(under.isFree).toBe(false);
    expect(under.remainingForFree).toBe(19.0);
    expect(under.carrier).toBe('DPD / PostNL');

    // Exactly at threshold
    const at = shop.calculateShipping(119.0);
    expect(at.cost).toBe(0.0);
    expect(at.isFree).toBe(true);
    expect(at.remainingForFree).toBe(0.0);

    // Over threshold
    const over = shop.calculateShipping(150.0);
    expect(over.cost).toBe(0.0);
    expect(over.isFree).toBe(true);
  });

  it('Botland: €4.99 standard shipping, free from €100.00', () => {
    const shop = registry.getShop('botland')!;

    // Under threshold
    const under = shop.calculateShipping(60.0);
    expect(under.cost).toBe(4.99);
    expect(under.isFree).toBe(false);
    expect(under.remainingForFree).toBe(40.0);
    expect(under.carrier).toBe('GLS Kurier');

    // Exactly at threshold
    const at = shop.calculateShipping(100.0);
    expect(at.cost).toBe(0.0);
    expect(at.isFree).toBe(true);
    expect(at.remainingForFree).toBe(0.0);

    // Over threshold
    const over = shop.calculateShipping(110.0);
    expect(over.cost).toBe(0.0);
    expect(over.isFree).toBe(true);
  });

  it('AliExpress: €2.99 standard shipping, free Choice from €10.00', () => {
    const shop = registry.getShop('aliexpress')!;

    // Under threshold
    const under = shop.calculateShipping(6.0);
    expect(under.cost).toBe(2.99);
    expect(under.isFree).toBe(false);
    expect(under.remainingForFree).toBe(4.0);

    // Exactly at threshold
    const at = shop.calculateShipping(10.0);
    expect(at.cost).toBe(0.0);
    expect(at.isFree).toBe(true);
    expect(at.remainingForFree).toBe(0.0);
  });
});

describe('CartService Multi-Store Operations', () => {
  let registry: ShopRegistry;
  let cart: CartService;

  beforeEach(() => {
    registry = new ShopRegistry();
    registerAllShops(registry);
    cart = new CartService(registry, new SearchService(registry));
  });

  it('adds items to separate store carts and aggregates accurately', async () => {
    const berryItem: ComponentItem = {
      id: 'bb-1',
      slug: 'berrybase:bb-1',
      shopId: 'berrybase',
      shopName: 'BerryBase',
      title: 'Raspberry Pi Pico',
      brand: 'Raspberry Pi',
      sku: 'PI-PICO',
      price: 4.5,
      currency: 'EUR',
      formattedPrice: '€ 4,50',
      inStock: true,
      stockDescription: 'Auf Lager',
      url: 'https://www.berrybase.de/pico',
      imageUrl: null,
      shippingEstimate: '1-3 Werktage',
      category: 'microcontroller',
    };

    const aliItem: ComponentItem = {
      id: 'ali-1',
      slug: 'aliexpress:ali-1',
      shopId: 'aliexpress',
      shopName: 'AliExpress',
      title: '10x BME280 Sensor Module',
      brand: null,
      sku: null,
      price: 2.1,
      currency: 'EUR',
      formattedPrice: '€ 2,10',
      inStock: true,
      stockDescription: 'Auf Lager',
      url: 'https://www.aliexpress.com/item/ali-1.html',
      imageUrl: null,
      shippingEstimate: '7-15 Werktage',
      category: 'sensor',
    };

    // Add 2x Pico to BerryBase
    await cart.addItem('berrybase:bb-1', 2, berryItem);

    // Add 3x BME280 to AliExpress
    await cart.addItem('aliexpress:ali-1', 3, aliItem);

    // BerryBase cart: subtotal = 2 * 4.50 = 9.00. Shipping = 4.95. Total = 13.95
    const bbCart = cart.getCart('berrybase')!;
    expect(bbCart.itemCount).toBe(2);
    expect(bbCart.subtotal).toBe(9.0);
    expect(bbCart.shipping.cost).toBe(4.95);
    expect(bbCart.total).toBe(13.95);

    // AliExpress cart: subtotal = 3 * 2.10 = 6.30. Shipping = 2.99. Total = 9.29
    const aliCart = cart.getCart('aliexpress')!;
    expect(aliCart.itemCount).toBe(3);
    expect(aliCart.subtotal).toBe(6.3);
    expect(aliCart.shipping.cost).toBe(2.99);
    expect(aliCart.total).toBe(9.29);

    // All carts summary
    const summary = cart.getAllCarts();
    expect(summary.totalItemCount).toBe(5);
    expect(summary.combinedSubtotal).toBe(15.3); // 9.00 + 6.30
    expect(summary.combinedShipping).toBe(7.94); // 4.95 + 2.99
    expect(summary.grandTotal).toBe(23.24); // 15.30 + 7.94
  });

  it('qualifies for free shipping when item quantities meet the threshold', async () => {
    const item: ComponentItem = {
      id: 'rbs-1',
      slug: 'roboter-bausatz:rbs-1',
      shopId: 'roboter-bausatz',
      shopName: 'Roboter-Bausatz',
      title: 'Stepper Motor Kit',
      brand: null,
      sku: null,
      price: 25.0,
      currency: 'EUR',
      formattedPrice: '€ 25,00',
      inStock: true,
      stockDescription: 'Auf Lager',
      url: 'https://www.roboter-bausatz.de/motor',
      imageUrl: null,
      shippingEstimate: '1-3 Werktage',
      category: 'motor_driver',
    };

    // Add 3x: subtotal = 75.00 (< 99.00) -> shipping €4.45
    await cart.addItem('roboter-bausatz:rbs-1', 3, item);
    let rbsCart = cart.getCart('roboter-bausatz')!;
    expect(rbsCart.shipping.cost).toBe(4.45);
    expect(rbsCart.shipping.isFree).toBe(false);
    expect(rbsCart.shipping.remainingForFree).toBe(24.0);

    // Update quantity to 4x: subtotal = 100.00 (>= 99.00) -> free shipping €0.00
    await cart.updateItem('roboter-bausatz:rbs-1', 4);
    rbsCart = cart.getCart('roboter-bausatz')!;
    expect(rbsCart.subtotal).toBe(100.0);
    expect(rbsCart.shipping.cost).toBe(0.0);
    expect(rbsCart.shipping.isFree).toBe(true);
    expect(rbsCart.shipping.remainingForFree).toBe(0.0);
    expect(rbsCart.total).toBe(100.0);
  });

  it('removes items and clears carts', async () => {
    const item: ComponentItem = {
      id: 'bot-1',
      slug: 'botland:bot-1',
      shopId: 'botland',
      shopName: 'Botland',
      title: 'Arduino Uno R4',
      brand: 'Arduino',
      sku: null,
      price: 24.0,
      currency: 'EUR',
      formattedPrice: '€ 24,00',
      inStock: true,
      stockDescription: 'Auf Lager',
      url: 'https://botland.de/arduino',
      imageUrl: null,
      shippingEstimate: '2-3 Werktage',
      category: 'microcontroller',
    };

    await cart.addItem('botland:bot-1', 1, item);
    expect(cart.getCart('botland')!.itemCount).toBe(1);

    // Update with 0 removes item
    await cart.updateItem('botland:bot-1', 0);
    expect(cart.getCart('botland')!.itemCount).toBe(0);

    // Clear cart
    await cart.addItem('botland:bot-1', 2, item);
    cart.clear('botland');
    expect(cart.getCart('botland')!.itemCount).toBe(0);
  });

  it('supports selecting local pickup for stores with physical locations', async () => {
    const berryItem: ComponentItem = {
      id: 'bb-p1',
      slug: 'berrybase:bb-p1',
      shopId: 'berrybase',
      shopName: 'BerryBase',
      title: 'ESP32-WROOM-32D',
      brand: 'Espressif',
      sku: 'ESP32-WROOM',
      price: 3.5,
      currency: 'EUR',
      formattedPrice: '€ 3,50',
      inStock: true,
      stockDescription: 'Auf Lager',
      url: 'https://www.berrybase.de/esp32',
      imageUrl: null,
      shippingEstimate: '1-3 Werktage',
      category: 'microcontroller',
    };

    await cart.addItem('berrybase:bb-p1', 1, berryItem);

    // Default shipping: DHL €4.95
    let bbCart = cart.getCart('berrybase')!;
    expect(bbCart.shipping.carrier).toBe('DHL Paket');
    expect(bbCart.shipping.cost).toBe(4.95);
    expect(bbCart.shipping.isPickup).toBe(false);

    // Change to pickup
    const updated = cart.setShippingMethod('berrybase', 'pickup');
    expect(updated.shipping.isPickup).toBe(true);
    expect(updated.shipping.cost).toBe(0.0);
    expect(updated.shipping.isFree).toBe(true);
    expect(updated.shipping.pickupLocation?.name).toBe('BerryBase MakerSpace Berlin-Adlershof');
    expect(updated.shipping.pickupLocation?.city).toBe('Berlin');
    expect(updated.total).toBe(3.5); // subtotal only, no shipping cost
  });

  it('supports selecting alternative shipping methods like UPS Express Saver', async () => {
    const shop = registry.getShop('berrybase')!;

    // UPS Standard under threshold
    const upsStandard = shop.calculateShipping(100.0, { methodId: 'ups_standard' });
    expect(upsStandard.cost).toBe(5.9);
    expect(upsStandard.threshold).toBe(250.0);
    expect(upsStandard.remainingForFree).toBe(150.0);

    // UPS Standard above threshold
    const upsStandardFree = shop.calculateShipping(260.0, { methodId: 'ups_standard' });
    expect(upsStandardFree.cost).toBe(0.0);
    expect(upsStandardFree.isFree).toBe(true);

    // UPS Express Saver
    const upsExpress = shop.calculateShipping(50.0, { methodId: 'ups_express' });
    expect(upsExpress.cost).toBe(9.9);
    expect(upsExpress.type).toBe('express');
  });

  it('evaluates shipping and pickup rules for newly added German stores (Eckstein & Watterott)', () => {
    const eckstein = registry.getShop('eckstein')!;
    // Eckstein standard DHL (€6.50, free from €200.00)
    const eckUnder = eckstein.calculateShipping(40.0);
    expect(eckUnder.cost).toBe(6.5);
    expect(eckUnder.threshold).toBe(200.0);
    expect(eckUnder.remainingForFree).toBe(160.0);

    const eckAt = eckstein.calculateShipping(200.0);
    expect(eckAt.cost).toBe(0.0);
    expect(eckAt.isFree).toBe(true);

    // Eckstein pickup
    const eckPickup = eckstein.calculateShipping(10.0, { methodId: 'pickup' });
    expect(eckPickup.isPickup).toBe(true);
    expect(eckPickup.cost).toBe(0.0);
    expect(eckPickup.pickupLocation?.city).toBe('Clausthal-Zellerfeld');

    const watterott = registry.getShop('watterott')!;
    // Watterott standard DHL (€4.50, free from €100.00)
    const watUnder = watterott.calculateShipping(50.0);
    expect(watUnder.cost).toBe(4.5);
    expect(watUnder.threshold).toBe(100.0);

    const watAt = watterott.calculateShipping(100.0);
    expect(watAt.cost).toBe(0.0);
    expect(watAt.isFree).toBe(true);

    // Watterott pickup
    const watPickup = watterott.calculateShipping(20.0, { methodId: 'pickup' });
    expect(watPickup.isPickup).toBe(true);
    expect(watPickup.cost).toBe(0.0);
    expect(watPickup.pickupLocation?.city).toBe('Leinefelde-Worbis');
  });
});
