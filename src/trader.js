const { checkSignal } = require("./signal-engine");
const { buy, getOrderResult } = require("./broker-client");
const { fetchBalance } = require("./candle-client");

async function startTrader({ userId, assets, asset, stake, expiration, accountType, onResult, onError, onOrderPlaced, onOrderClosed, onSignal, minEntryInterval }) {
  const pairs = Array.isArray(assets) && assets.length
    ? assets.map((a) => String(a).toUpperCase())
    : [String(asset || "EURUSD").toUpperCase()];

  let active = true;
  let lastEntryAt = 0;

  // Intervalo mínimo (em ms) entre entradas. Nunca menor que a expiração,
  // para não sobrepor ordens abertas.
  const minIntervalMs = Math.max(
    Number(minEntryInterval != null ? minEntryInterval : process.env.BOT_MIN_ENTRY_SECONDS || 60) * 1000,
    Number(expiration || 1) * 60 * 1000 + 5000
  );

  // Resolve o resultado de uma ordem aberta e reporta via onResult
  async function settleOrder(orderId, direction, pair) {
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

      console.log(`[Trader User ${userId}] Ordem ${res.status.toUpperCase()}: ${direction} ${pair} id=${orderId} profit=${profit} balance=${balance}`);
      if (onResult) {
        onResult({ asset: pair, action: direction, win, profit, orderId, status: res.status, balance });
      }
      if (onOrderClosed) onOrderClosed({ orderId, status: res.status });
    } catch (err) {
      if (onError) onError(new Error(`Falha ao consultar ordem ${orderId}: ${err.message}`));
    }
  }

  const interval = setInterval(async () => {
    if (!active) return;

    const now = Date.now();
    if (now - lastEntryAt < minIntervalMs) return;

    for (const pair of pairs) {
      if (!active) return;

      const signal = await checkSignal(pair, onError);
      if (signal && active && Date.now() - lastEntryAt >= minIntervalMs) {
        lastEntryAt = Date.now();
        const direction = signal === "put" ? "put" : "call";
        console.log(`[Trader User ${userId}] Sinal ${signal} em ${pair} - abrindo ordem`);
        if (onSignal) onSignal({ asset: pair, direction, signal });

        try {
          const order = await buy(pair, direction, stake, expiration, accountType);
          if (!active) return;
          const startedAt = Date.now();
          const expiresAt = startedAt + Number(expiration || 1) * 60 * 1000;
          console.log(`[Trader User ${userId}] Ordem aberta id=${order.order_id} (${direction} ${pair} valor=${stake})`);
          if (onOrderPlaced) onOrderPlaced({ orderId: order.order_id, asset: pair, direction, stake, startedAt, expiresAt });
          settleOrder(order.order_id, direction, pair);
        } catch (err) {
          if (onError) onError(new Error(`Falha ao abrir ordem em ${pair}: ${err.message}`));
        }
        break;
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