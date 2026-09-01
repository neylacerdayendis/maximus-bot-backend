const { checkSignal } = require("./signal-engine");

async function startTrader({ userId, asset, stake, expiration, onResult, onError }) {
  let active = true;

  const interval = setInterval(async () => {
    if (!active) return;

    const signal = await checkSignal(asset, onError);
    if (signal) {
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
