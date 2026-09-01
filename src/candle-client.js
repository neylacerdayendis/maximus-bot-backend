const http = require("http");
const https = require("https");
const { URL } = require("url");

const CANDLE_SERVICE_URL = process.env.CANDLE_SERVICE_URL || "http://localhost:5001";

async function fetchCandles(asset, timeframe = 60, amount = 50) {
  return new Promise((resolve, reject) => {
    const url = `${CANDLE_SERVICE_URL}/candles?pair=${encodeURIComponent(asset)}&timeframe=${timeframe}&amount=${amount}`;
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    let settled = false;

    function done(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    }

    const timer = setTimeout(() => {
      req.destroy(new Error("Tempo esgotado aguardando o serviço de velas (40s)."));
    }, 40000);

    const req = client.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        headers: { "Accept": "application/json" }
      },
      (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          const ct = (res.headers["content-type"] || "") || "";
          if (res.statusCode >= 400 || !ct.includes("application/json")) {
            const preview = data.trim().slice(0, 80).replace(/\s+/g, " ");
            return done(reject, new Error(`O serviço de velas respondeu sem JSON (${res.statusCode}): ${preview}`));
          }
          try {
            const parsed = JSON.parse(data);
            done(resolve, Array.isArray(parsed) ? parsed : (parsed.candles || []));
          } catch (e) {
            done(reject, new Error("JSON inválido do serviço de velas."));
          }
        });
      }
    );

    req.on("error", (err) => {
      done(reject, new Error(
        String(err && err.message || err).includes("Tempo esgotado")
          ? "Tempo esgotado aguardando o serviço de velas."
          : `Falha de conexão com o serviço de velas: ${err && err.message || err}`
      ));
    });
  });
}

// Consulta o saldo atual da conta no serviço Python (GET /balance)
async function fetchBalance(accountType) {
  return new Promise((resolve, reject) => {
    const qs = accountType ? `?account_type=${encodeURIComponent(accountType)}` : "";
    const url = `${CANDLE_SERVICE_URL}/balance${qs}`;
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    let settled = false;

    function done(fn, val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    }

    const timer = setTimeout(() => {
      req.destroy(new Error("Tempo esgotado aguardando o saldo (15s)."));
    }, 15000);

    const req = client.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        headers: { "Accept": "application/json" }
      },
      (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          const ct = (res.headers["content-type"] || "") || "";
          if (res.statusCode >= 400 || !ct.includes("application/json")) {
            const preview = data.trim().slice(0, 80).replace(/\s+/g, " ");
            return done(reject, new Error(`Serviço de saldo respondeu sem JSON (${res.statusCode}): ${preview}`));
          }
          try { done(resolve, JSON.parse(data)); }
          catch (e) { done(reject, new Error("JSON inválido do serviço de saldo.")); }
        });
      }
    );

    req.on("error", (err) => {
      done(reject, new Error(`Falha de conexão com o serviço de saldo: ${err && err.message || err}`));
    });
  });
}

module.exports = { fetchCandles, fetchBalance };