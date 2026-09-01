const http = require("http");
const https = require("https");
const { URL } = require("url");

const CANDLE_SERVICE_URL = process.env.CANDLE_SERVICE_URL || "http://localhost:5001";

function request(method, path, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CANDLE_SERVICE_URL}${path}`);
    const client = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    let settled = false;

    function done(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    }

    const timer = setTimeout(() => {
      req.destroy(new Error("Tempo esgotado aguardando o serviço de corretora (30s)."));
    }, timeoutMs);

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const ct = (res.headers["content-type"] || "") || "";
          if (!ct.includes("application/json")) {
            const preview = data.trim().slice(0, 80).replace(/\s+/g, " ");
            return done(reject, new Error(`O serviço de corretora respondeu sem JSON (${res.statusCode}): ${preview} `));
          }
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return done(reject, new Error(`JSON inválido do serviço de corretora (${res.statusCode}).`));
          }
          if (res.statusCode >= 400 || parsed.error) {
            return done(reject, new Error(parsed.error || `Erro ${res.statusCode}`));
          }
          done(resolve, parsed);
        });
      }
    );

    req.on("error", (err) => {
      done(reject, new Error(
        String(err && err.message || err).includes("Tempo esgotado")
          ? "Tempo esgotado aguardando o serviço de corretora."
          : `Falha de conexão com o serviço de corretora: ${err && err.message || err}`
      ));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// Abre uma ordem na corretora (demanda POST /order/buy no serviço Python)
async function buy(pair, direction, amount, expiration = 1, accountType = "PRACTICE") {
  return request("POST", "/order/buy", { pair, direction, amount, expiration, account_type: accountType });
}

// Consulta o resultado de uma ordem expirada (GET /order/result)
async function getOrderResult(orderId) {
  // check_win_v4 no serviço Python bloqueia até a ordem expirar; damos folga (90s)
  return request("GET", `/order/result?order_id=${encodeURIComponent(orderId)}`, null, 90000);
}

module.exports = { buy, getOrderResult };
