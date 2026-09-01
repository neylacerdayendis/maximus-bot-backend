const http = require("http");
const https = require("https");
const { URL } = require("url");

const CANDLE_SERVICE_URL = process.env.CANDLE_SERVICE_URL || "http://localhost:5001";

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CANDLE_SERVICE_URL}${path}`);
    const client = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return reject(new Error(`Resposta inválida (${res.statusCode}): ${data}`));
          }
          if (res.statusCode >= 400 || parsed.error) {
            return reject(new Error(parsed.error || `Erro ${res.statusCode}`));
          }
          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Abre uma ordem na corretora (demanda POST /order/buy no serviço Python)
async function buy(pair, direction, amount, expiration = 1) {
  return request("POST", "/order/buy", { pair, direction, amount, expiration });
}

// Consulta o resultado de uma ordem expirada (GET /order/result)
async function getOrderResult(orderId) {
  return request("GET", `/order/result?order_id=${encodeURIComponent(orderId)}`);
}

module.exports = { buy, getOrderResult };
