const http = require("http");
const https = require("https");
const { URL } = require("url");

const CANDLE_SERVICE_URL = process.env.CANDLE_SERVICE_URL || "http://localhost:5001";

async function fetchCandles(asset, timeframe = 60, amount = 50) {
  return new Promise((resolve, reject) => {
    const url = `${CANDLE_SERVICE_URL}/candles?asset=${asset}&timeframe=${timeframe}&amount=${amount}`;
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;

    client.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", (err) => reject(err));
  });
}

module.exports = { fetchCandles };
