const { fetchCandles } = require("./candle-client");
const { analyzeCandles } = require("./combo1-engine");

// Candles M1 mudam a cada 60s; intervalo entre consultas por par.
const CANDLE_POLL_MS = 60000;

// Pausa maior quando o serviço responde 429 (Too Many Requests)
const RATE_LIMIT_BACKOFF_MS = 90000;

// Espalha as primeiras consultas entre os pares para não estourar o rate limit
const STAGGER_STEP_MS = 5000;
const MAX_STAGGER_SLOTS = 12;

const stateMap = new Map();
let staggerSeq = 0;

function getState(asset) {
  let s = stateMap.get(asset);
  if (!s) {
    s = { fetchedAt: 0, signal: null, backoffUntil: 0, firstRun: true };
    stateMap.set(asset, s);
  }
  return s;
}

function isRateLimited(error) {
  const raw = error && error.message ? error.message : String(error || "");
  return raw.includes("429") || raw.toLowerCase().includes("too many requests");
}

async function checkSignal(asset, onError) {
  const state = getState(asset);
  const now = Date.now();

  if (state.backoffUntil > now) {
    return state.signal;
  }

  if (state.firstRun) {
    state.firstRun = false;
    const slot = staggerSeq % MAX_STAGGER_SLOTS;
    staggerSeq += 1;
    state.fetchedAt = now - CANDLE_POLL_MS + slot * STAGGER_STEP_MS;
  }

  if (now - state.fetchedAt < CANDLE_POLL_MS) {
    return state.signal;
  }

  try {
    const candles = await fetchCandles(asset);
    state.fetchedAt = Date.now();
    state.signal = analyzeCandles(candles);
    if (state.signal) {
      console.log(`[signal-engine] Sinal detectado em ${asset}: ${state.signal}`);
    }
    return state.signal;
  } catch (error) {
    if (isRateLimited(error)) {
      state.backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.error(`[signal-engine] Rate limit (429) em ${asset} - pausa de 90s.`);
      if (onError) onError(new Error(`Serviço de velas com limite de requisições (429) ao buscar ${asset}. Pausa de 90s.`));
      return null;
    }
    const message = (error && error.code === 'ECONNREFUSED') || String(error).includes('ECONNREFUSED')
      ? `Não foi possível conectar ao serviço de velas em '${process.env.CANDLE_SERVICE_URL || 'http://localhost:5001'}'. Verifique se o serviço Python está no ar e a variável CANDLE_SERVICE_URL.`
      : (error && error.message ? error.message : String(error));
    if (onError) onError(new Error(message));
    console.error(`[signal-engine] Erro ao obter sinal de ${asset}:`, error && error.message ? error.message : error);
    return null;
  }
}

module.exports = { checkSignal };