const { checkSignal } = require("./signal-engine");

async function startTrader({ userId, asset, stake, expiration, onResult, onError, minEntryInterval }) {
  let active = true;
  let lastEntryAt = 0;

  // Intervalo mínimo (em ms) entre entradas para evitar reentrada exagerada.
  // Default: 60s. Pode ser configurado via environment BOT_MIN_ENTRY_SECONDS.
  const minIntervalMs = Number(minEntryInterval != null ? minEntryInterval : process.env.BOT_MIN_ENTRY_SECONDS) * 1000;

  const interval = setInterval(async () => {
    if (!active) return;

    const signal = await checkSignal(asset, onError);
    const now = Date.now();
    if (signal && now - lastEntryAt >= minIntervalMs) {
      lastEntryAt = now;
      console.log(`[Trader User ${userId}] Sinal detectado: ${signal} para ${asset}`);
      // Simulação de resultado de entrada
      const win = Math.random() > 0.4;
      const profit = win ? stake * 0.85 : -stake;

      if (onResult) {
        onResult({ asset, action: signal, win, profit });
      }
    }
  }, 5000);

  return () => {
    active = false;
    clearInterval(interval);
    console.log(`[Trader User ${userId}] Parado.`);
  };
}

module.exports = { startTrader };
