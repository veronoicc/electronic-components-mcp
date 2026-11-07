import { shopRegistry } from '../src/registry/shop-registry.js';
import { cartService } from '../src/services/cart-service.js';
import { searchService } from '../src/services/search-service.js';
import { registerAllShops } from '../src/shops/index.js';
import type { ComponentItem } from '../src/types/component.js';

async function runLiveSmoke() {
  console.log('=== ELECTRONIC COMPONENTS MCP - LIVE SMOKE TEST ===\n');

  registerAllShops(shopRegistry);
  const shops = shopRegistry.getAllShops();
  console.log(`Registered shops (${shops.length}):`, shops.map((s) => s.metadata.id).join(', '));

  // 1. Test search on each individual shop
  console.log(`\n--- Step 1: Testing live search for "esp32" on all ${shops.length} shops ---`);
  const retrievedItems: ComponentItem[] = [];

  for (const shop of shops) {
    try {
      const startTime = Date.now();
      const results = await shop.search('esp32', { limit: 5 });
      const elapsed = Date.now() - startTime;
      console.log(`✓ [${shop.metadata.id}] Found ${results.length} items in ${elapsed}ms`);

      if (results.length > 0) {
        const item = results[0];
        console.log(`   Sample item:`);
        console.log(`   - ID: ${item.id}`);
        console.log(`   - Slug: ${item.slug}`);
        console.log(`   - Title: ${item.title}`);
        console.log(`   - Price: ${item.formattedPrice} (${item.price} EUR)`);
        console.log(`   - In Stock: ${item.inStock}`);
        console.log(`   - URL: ${item.url}`);
        retrievedItems.push(item);
      } else {
        console.warn(`   WARNING: No items returned for shop ${shop.metadata.id}`);
      }
    } catch (err: unknown) {
      console.error(`✗ [${shop.metadata.id}] Live search failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  // 2. Test multi-region search via SearchService
  console.log('\n--- Step 2: Testing SearchService region routing ---');
  // Default: all registered shops
  const defaultResults = await searchService.search({ query: 'esp32', limit: 2 });
  console.log(`Default search (all shops): ${defaultResults.length} items (shops: ${Array.from(new Set(defaultResults.map((i) => i.shopId))).join(', ')})`);

  // German only: ['de']
  const deResults = await searchService.search({ query: 'esp32', countries: ['de'], limit: 2 });
  console.log(`German search (['de']): ${deResults.length} items (shops: ${Array.from(new Set(deResults.map((i) => i.shopId))).join(', ')})`);

  // Global only: ['global']
  const globalResults = await searchService.search({ query: 'esp32', countries: ['global'], limit: 2 });
  console.log(`Global search (['global']): ${globalResults.length} items (shops: ${Array.from(new Set(globalResults.map((i) => i.shopId))).join(', ')})`);
  // 3. Test get_component_by_slug
  console.log('\n--- Step 3: Testing get_component_by_slug ---');
  for (const item of retrievedItems.slice(0, 4)) {
    try {
      const fetched = await searchService.getBySlug(item.slug);
      if (fetched) {
        console.log(`✓ Retrieved by slug "${item.slug}": "${fetched.title}" (${fetched.formattedPrice})`);
      } else {
        console.warn(`✗ Could not retrieve by slug "${item.slug}"`);
      }
    } catch (err: unknown) {
      console.error(`✗ Slug fetch error for "${item.slug}":`, err instanceof Error ? err.message : String(err));
    }
  }

  // 4. Test multi-store Cart Operations with retrieved live items
  console.log('\n--- Step 4: Testing multi-store cart operations ---');
  cartService.clear();

  for (const item of retrievedItems) {
    await cartService.addItem(item.slug, 2, item);
    console.log(`✓ Added 2x "${item.title}" to ${item.shopId} cart`);
  }

  let allCarts = cartService.getAllCarts('de');
  console.log('\n--- Multi-Store Cart Summary (Default Standard Shipping) ---');
  console.log(`Total item count across all stores: ${allCarts.totalItemCount}`);
  console.log(`Combined subtotal: € ${allCarts.combinedSubtotal.toFixed(2)}`);
  console.log(`Combined shipping: € ${allCarts.combinedShipping.toFixed(2)}`);
  console.log(`Grand Total: € ${allCarts.grandTotal.toFixed(2)}`);

  console.log('\nBreakdown per shop:');
  for (const c of allCarts.carts) {
    console.log(`- [${c.shopName}] Subtotal: €${c.subtotal.toFixed(2)} | Method: ${c.shipping.methodName} | Cost: €${c.shipping.cost.toFixed(2)} | Total: €${c.total.toFixed(2)}`);
    if (!c.shipping.isFree && c.shipping.remainingForFree) {
      console.log(`  -> Needs €${c.shipping.remainingForFree.toFixed(2)} more for free shipping`);
    }
  }

  // 5. Test Pickup and Alternative Shipping Selection
  console.log('\n--- Step 5: Testing Local Pickup & Alternative Shipping Selection ---');
  const bbCartBefore = cartService.getCart('berrybase')!;
  console.log(`BerryBase before pickup: method=${bbCartBefore.shipping.methodName}, cost=€${bbCartBefore.shipping.cost.toFixed(2)}`);

  // Switch BerryBase to pickup
  const bbPickupCart = cartService.setShippingMethod('berrybase', 'pickup');
  console.log(`✓ Switched BerryBase to pickup:`);
  console.log(`   Method: ${bbPickupCart.shipping.methodName}`);
  console.log(`   Cost: €${bbPickupCart.shipping.cost.toFixed(2)} (isFree: ${bbPickupCart.shipping.isFree}, isPickup: ${bbPickupCart.shipping.isPickup})`);
  console.log(`   Pickup Location: ${bbPickupCart.shipping.pickupLocation?.name}, ${bbPickupCart.shipping.pickupLocation?.address}, ${bbPickupCart.shipping.pickupLocation?.city}`);

  // Switch Eckstein to pickup
  if (retrievedItems.some((i) => i.shopId === 'eckstein')) {
    const eckPickup = cartService.setShippingMethod('eckstein', 'pickup');
    console.log(`✓ Switched Eckstein to pickup:`);
    console.log(`   Method: ${eckPickup.shipping.methodName}`);
    console.log(`   Cost: €${eckPickup.shipping.cost.toFixed(2)}`);
    console.log(`   Pickup Location: ${eckPickup.shipping.pickupLocation?.name}, ${eckPickup.shipping.pickupLocation?.city}`);
  }

  // Re-check multi-store summary after pickup selection
  allCarts = cartService.getAllCarts('de');
  console.log('\n--- Multi-Store Cart Summary (With Local Pickups) ---');
  console.log(`Combined subtotal: € ${allCarts.combinedSubtotal.toFixed(2)}`);
  console.log(`Combined shipping: € ${allCarts.combinedShipping.toFixed(2)}`);
  console.log(`Grand Total: € ${allCarts.grandTotal.toFixed(2)}`);

  // Remove one item and check update
  if (retrievedItems.length > 0) {
    const firstSlug = retrievedItems[0].slug;
    console.log(`\nRemoving "${firstSlug}" from cart...`);
    cartService.removeItem(firstSlug);
    const updated = cartService.getAllCarts('de');
    console.log(`New total item count: ${updated.totalItemCount}`);
  }

  console.log('\n=== LIVE SMOKE TEST COMPLETED SUCCESSFULLY ===');
}

runLiveSmoke().catch((err: unknown) => {
  console.error('Smoke test encountered an unhandled error:', err);
  process.exit(1);
});
