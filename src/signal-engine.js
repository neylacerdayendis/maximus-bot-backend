const { fetchCandles } = require("./candle-client");
const { analyzeCandles } = require("./combo1-engine");

async function checkSignal(asset) {
  try {
    const candles = await fetchCandles(asset);
    return analyzeCandles(candles);
  } catch (error) {
    console.error("Erro ao obter sinal:", error.message);
    return null;
  }
}

module.exports = { checkSignal };
