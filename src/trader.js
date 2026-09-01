const { checkSignal } = require("./signal-engine");
const { buy, getOrderResult } = require("./broker-client");
const { fetchBalance } = require("./candle-client");

async function startTrader({ userId, asset, stake, expiration, accountType, onResult, onError, onOrderPlaced, onOrderClosed, minEntryInterval }) {
  let active = true;
  let lastEntryAt = 0;

  // Intervalo mínimo (em ms) entre entradas. Nunca menor que a expiração,
  // para não sobrepor ordens abertas.
  const minIntervalMs = Math.max(
    Number(minEntryInterval != null ? minEntryInterval : process.env.BOT_MIN_ENTRY_SECONDS || 60) * 1000,
    Number(expiration || 1) * 60 * 1000 + 5000
  );

  // Resolve o resultado de uma ordem aberta e reporta via onResult
  async function settleOrder(orderId, direction) {
    if (!active) return;
    try {
      // Espera a ordem expirar antes de consultar (check_win_v4 bloqueia até lá)
      await new Promise((r) => setTimeout(r, Number(expiration || 1) * 60 * 1000));
      if (!active) return;

      const res = await getOrderResult(orderId);
      const win = res.status === "win";
      const profit = Number(res.profit || 0);

      // Busca o saldo real da IQ após a operação (usado como base do painel)
      let balance = null;
      try {
        const b = await fetchBalance(accountType);
        if (b && typeof b.balance === 'number' && isFinite(b.balance)) balance = b.balance;
      } catch (e) {
        // se falhar, deixa balance = null e o backend calcula virtualmente
      }

      console.log(`[Trader User ${userId}] Ordem ${res.status.toUpperCase()}: ${direction} ${asset} id=${orderId} profit=${profit} balance=${balance}`);
      if (onResult) {
        onResult({ asset, action: direction, win, profit, orderId, status: res.status, balance });
      }
      if (onOrderClosed) onOrderClosed({ orderId, status: res.status });
    } catch (err) {
      if (onError) onError(new Error(`Falha ao consultar ordem ${orderId}: ${err.message}`));
    }
  }

  const interval = setInterval(async () => {
    if (!active) return;

    const signal = await checkSignal(asset, onError);
    const now = Date.now();
    if (signal && now - lastEntryAt >= minIntervalMs) {
      lastEntryAt = now;
      const direction = signal === "put" ? "put" : "call";
      console.log(`[Trader User ${userId}] Sinal detectado: ${signal} para ${asset} - abrindo ordem`);

      try {
        const order = await buy(asset, direction, stake, expiration, accountType);
        if (!active) return;
        const startedAt = Date.now();
        const expiresAt = startedAt + Number(expiration || 1) * 60 * 1000;
        console.log(`[Trader User ${userId}] Ordem aberta id=${order.order_id} (${direction} ${asset} valor=${stake})`);
        if (onOrderPlaced) onOrderPlaced({ orderId: order.order_id, asset, direction, stake, startedAt, expiresAt });
        settleOrder(order.order_id, direction);
      } catch (err) {
        if (onError) onError(new Error(`Falha ao abrir ordem: ${err.message}`));
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
