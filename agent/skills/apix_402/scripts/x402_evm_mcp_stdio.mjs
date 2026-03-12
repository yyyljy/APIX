#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const invoke = require("./x402_evm_invoke.js");

const server = new McpServer(
  { name: "x402-evm", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const ToolInput = z.object({
  url: z.string(),
  method: z.string().optional(),
  body: z.any().optional(),
  chain_id: z.string().optional(),
  network: z.string().optional(),
  payer_private_key: z.string().optional(),
  rpc_url: z.string().optional(),
  client_type: z.string().optional(),
  payment_signature_header: z.string().optional(),
  timeout_ms: z.number().optional(),
  max_retries: z.number().optional(),
});

server.registerTool(
  "x402_evm_invoke",
  {
    description: "Invoke x402-enabled endpoint; auto-handle 402 payment using APIX native coin.",
    inputSchema: ToolInput,
  },
  async (input) => {
    const result = await invoke(input || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
