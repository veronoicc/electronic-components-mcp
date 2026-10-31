#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { shopRegistry } from './registry/shop-registry.js';
import { registerAllShops } from './shops/index.js';
import { registerTools } from './tools/register-tools.js';

async function main(): Promise<void> {
  registerAllShops(shopRegistry);

  const server = new McpServer({
    name: '@veronoicc/electronic-components-mcp',
    version: '1.0.0',
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[@veronoicc/electronic-components-mcp] Server running on stdio');
}

main().catch((err: unknown) => {
  console.error('[@veronoicc/electronic-components-mcp] Fatal error:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
