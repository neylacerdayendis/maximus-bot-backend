const { fetchCandles } = require("./candle-client");
const { analyzeCandles } = require("./combo1-engine");

async function checkSignal(asset, onError) {
  try {
    const candles = await fetchCandles(asset);
    return analyzeCandles(candles);
  } catch (error) {
    const message = (error && error.code === 'ECONNREFUSED') || String(error).includes('ECONNREFUSED')
      ? `Não foi possível conectar ao serviço de velas em '${process.env.CANDLE_SERVICE_URL || 'http://localhost:5001'}'. Verifique se o serviço Python está no ar e a variável CANDLE_SERVICE_URL.`
      : (error && error.message ? error.message : String(error));
    if (onError) onError(new Error(message));
    console.error("Erro ao obter sinal:", error && error.message ? error.message : error);
    return null;
  }
}

module.exports = { checkSignal };
