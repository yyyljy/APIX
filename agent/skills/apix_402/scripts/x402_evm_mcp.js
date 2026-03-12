#!/usr/bin/env node
/* MCP-style HTTP wrapper for x402_evm_invoke */
const http = require("http");
const { URL } = require("url");
const invoke = require("./x402_evm_invoke");

const PORT = Number(process.env.X402_EVM_PORT || 4020);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/invoke") {
    try {
      const body = await readJson(req);
      const result = await invoke(body);
      return send(res, 200, result);
    } catch (err) {
      return send(res, 500, { success: false, error: String(err?.message || err) });
    }
  }

  return send(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`x402_evm_invoke MCP server listening on http://127.0.0.1:${PORT}`);
});
