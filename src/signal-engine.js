const { fetchCandles } = require("./candle-client");
const { analyzeCandles } = require("./combo1-engine");

// Intervalo mínimo entre consultas ao serviço de velas. Candles M1 mudam a
// cada 60s; consultar a cada 5s só gera 429 (rate limit) no Render.
const CANDLE_POLL_MS = 30000;

// Backoff adicional quando o serviço responde 429 (Too Many Requests)
const RATE_LIMIT_BACKOFF_MS = 60000;

let lastFetchAt = 0;
let lastSignal = null;
let backoffUntil = 0;

async function checkSignal(asset, onError) {
  const now = Date.now();

  // Se estamos em backoff após 429, usa o último sinal sem consultar
  if (backoffUntil > now) {
    return lastSignal;
  }

  // Usa o sinal cacheado entre consultas (evita estourar o rate limit)
  if (now - lastFetchAt < CANDLE_POLL_MS) {
    return lastSignal;
  }

  try {
    const candles = await fetchCandles(asset);
    lastFetchAt = Date.now();
    lastSignal = analyzeCandles(candles);
    return lastSignal;
  } catch (error) {
    const raw = error && error.message ? error.message : String(error);
    // Se o serviço estiver limitando requisições, dá uma pausa maior
    if (raw.includes("429") || raw.toLowerCase().includes("too many requests")) {
      backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.error("[signal-engine] Rate limit (429) - pausa de 1 min.");
      if (onError) onError(new Error("Serviço de velas com limite de requisições (429). Pausa de 1 minuto."));
      return null;
    }
    const message = (error && error.code === 'ECONNREFUSED') || String(error).includes('ECONNREFUSED')
      ? `Não foi possível conectar ao serviço de velas em '${process.env.CANDLE_SERVICE_URL || 'http://localhost:5001'}'. Verifique se o serviço Python está no ar e a variável CANDLE_SERVICE_URL.`
      : raw;
    if (onError) onError(new Error(message));
    console.error("Erro ao obter sinal:", error && error.message ? error.message : error);
    return null;
  }
}

module.exports = { checkSignal };
