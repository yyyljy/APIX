#!/usr/bin/env node
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import process from "node:process";

type PaymentInput = {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  payer_private_key?: string;
  chain_id?: string;
  network?: string;
  rpc_url?: string;
  payment_signature_header?: string;
  timeout_ms?: number;
  max_retries?: number;
};

type CliOptions = Record<string, string>;

const entryPath = process.argv[1] || process.cwd();
const cjsRequire = createRequire(`${dirname(entryPath)}/`);
const invoke = cjsRequire("../scripts/x402_evm_invoke");

export const x402_evm_invoke = async (input: PaymentInput) => invoke(input);

export default x402_evm_invoke;

function sanitizeMessage(message: string, privateKey?: string): string {
  if (!privateKey) return message;
  const escaped = privateKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.replace(new RegExp(escaped, "g"), "[REDACTED]");
}

function parseJsonFile(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (_err) {
    return undefined;
  }
}

async function findPrivateKey(): Promise<string | undefined> {
  if (process.env.APIX_PRIVATE_KEY) {
    return String(process.env.APIX_PRIVATE_KEY).trim();
  }

  const rootConfigPaths = [
    join(process.cwd(), "x402-config.json"),
    join(homedir(), ".x402-config.json")
  ];

  for (const file of rootConfigPaths) {
    const config = parseJsonFile(file);
    if (!config) continue;
    const candidates = [
      config.private_key,
      config.privateKey,
      config.APIX_PRIVATE_KEY,
      config.apix_private_key
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  const mcporterPath = join(homedir(), ".mcporter", "mcporter.json");
  const mcporterConfig = parseJsonFile(mcporterPath);
  if (mcporterConfig?.mcpServers && typeof mcporterConfig.mcpServers === "object") {
    const servers = mcporterConfig.mcpServers as Record<string, Record<string, unknown>>;
    const orderedServers = [
      servers["x402-payment-apix-evm"],
      servers["tron-mcp-server"],
      ...Object.values(servers)
    ];
    for (const server of orderedServers) {
      if (!server) continue;
      const env = server.env as Record<string, unknown> | undefined;
      const key =
        typeof env?.APIX_PRIVATE_KEY === "string"
          ? env.APIX_PRIVATE_KEY
          : typeof env?.TRON_PRIVATE_KEY === "string"
          ? (env.TRON_PRIVATE_KEY as string)
          : undefined;
      if (key && key.trim()) return String(key).trim();
    }
  }

  return undefined;
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value && !value.startsWith("--")) {
      options[key] = value;
      i += 1;
      continue;
    }
    options[key] = "true";
  }
  return options;
}

function parseInput(): PaymentInput {
  const stdin = readFileSync(0, "utf8").trim();
  if (stdin) {
    try {
      const parsed = JSON.parse(stdin);
      if (parsed && typeof parsed === "object") {
        return parsed as PaymentInput;
      }
    } catch (_err) {
      // fallback to argv parsing
    }
  }

  const args = parseCliOptions(process.argv.slice(2));
  if (Object.keys(args).length > 0) {
    const input: PaymentInput = {
      url: args.url,
      method: args.method,
      chain_id: args.chain_id,
      network: args.network,
      rpc_url: args.rpc_url,
      payment_signature_header: args.payment_signature_header
    };

    if (args.body) {
      try {
        input.body = JSON.parse(args.body) as Record<string, unknown>;
      } catch (_err) {
        throw new Error("--body must be valid JSON");
      }
    }
    if (args.payer_private_key) input.payer_private_key = args.payer_private_key;
    if (args.timeout_ms) input.timeout_ms = Number(args.timeout_ms);
    if (args.max_retries) input.max_retries = Number(args.max_retries);

    if (!input.url) {
      throw new Error("url is required. Use --url or provide JSON input.");
    }
    return input;
  }

  const jsonArg = process.argv[2];
  if (jsonArg) {
    try {
      const parsed = JSON.parse(jsonArg);
      if (parsed && typeof parsed === "object") return parsed as PaymentInput;
    } catch (_err) {
      throw new Error("Invalid JSON input. Provide --url ... or a valid JSON object.");
    }
  }

  throw new Error("No input provided. Use --url or pass JSON input via stdin.");
}

async function run() {
  try {
    const input = parseInput();
    if (!input.payer_private_key) {
      const key = await findPrivateKey();
      if (key) input.payer_private_key = key;
    }

    if (!input.url) {
      throw new Error("url is required");
    }

    if (!input.payer_private_key) {
      throw new Error("payment credentials not found. Set APIX_PRIVATE_KEY or provide payer_private_key.");
    }

    console.error(`[x402] request: ${input.method || "GET"} ${input.url}`);
    const result = await x402_evm_invoke(input);

    process.stdout.write(JSON.stringify(result));
    process.exit(result?.success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      JSON.stringify({
        success: false,
        status: 0,
        request_id: undefined,
        tx_hash: undefined,
        url: undefined,
        method: undefined,
        response: undefined,
        error: {
          code: "invalid_target",
          message,
          status: 0
        }
      })
    );
    process.exit(1);
  }
}

if (process.argv[1] && /[\\/]index\.(ts|js)$/i.test(process.argv[1])) {
  run().catch((error) => {
    const key = process.env.APIX_PRIVATE_KEY;
    const message = sanitizeMessage(error instanceof Error ? error.message : String(error), key);
    process.stdout.write(
      JSON.stringify({
        success: false,
        status: 0,
        request_id: undefined,
        tx_hash: undefined,
        url: undefined,
        method: undefined,
        response: undefined,
        error: {
          code: "invalid_target",
          message,
          status: 0
        }
      })
    );
    process.exit(1);
  });
}
