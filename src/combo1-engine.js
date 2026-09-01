function analyzeCandles(candles) {
  if (Array.isArray(candles) && candles.candles) candles = candles.candles;
  if (!Array.isArray(candles) || candles.length < 3) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Exemplo de Análise Técnica: Comandos, Pavios e Travamentos
  const isBullish = last.close > last.open;
  const isBearish = last.close < last.open;

  if (isBullish && prev.close > prev.open) {
    return "CALL";
  } else if (isBearish && prev.close < prev.open) {
    return "PUT";
  }

  return null;
}

module.exports = { analyzeCandles };
