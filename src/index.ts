#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { shopRegistry } from './registry/shop-registry.js';
import { registerAllShops } from './shops/index.js';
import { registerTools } from './tools/register-tools.js';

async function main(): Promise<void> {
  // Register all available shop adapters
  registerAllShops(shopRegistry);

  const server = new McpServer({
    name: 'electronic-components-mcp',
    version: '1.0.0',
  });

  // Register all 10 MCP tools
  registerTools(server);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[electronic-components-mcp] Server running on stdio');
}

main().catch((err: unknown) => {
  console.error('[electronic-components-mcp] Fatal error:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
