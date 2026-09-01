const { checkSignal } = require("./signal-engine");
const { buy, getOrderResult } = require("./broker-client");
const { fetchBalance } = require("./candle-client");

// Tempo que um par fica de fora quando a corretora diz que está indisponível
const UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000;

// Detecta a mensagem padrão da IQ Option quando o ativo não está negociável
// (ex.: "Cannot purchase an option (the asset is not available at the moment)")
function looksUnavailable(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("not available") ||
    m.includes("unavailable") ||
    m.includes("cannot purchase") ||
    m.includes("asset is not") ||
    m.includes("mercado fechado") ||
    m.includes("indispon")
  );
}

async function startTrader({ userId, assets, asset, stake, expiration, accountType, onResult, onError, onOrderPlaced, onOrderClosed, onSignal, onInfo, minEntryInterval }) {
  const pairs = Array.isArray(assets) && assets.length
    ? assets.map((a) => String(a).toUpperCase())
    : [String(asset || "EURUSD").toUpperCase()];

  let active = true;
  let lastEntryAt = 0;
  const cooldownUntil = new Map();

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

    // Reune os pares com sinal no momento (cache por par evita consultas extra)
    const signaled = [];
    for (const pair of pairs) {
      if (!active) return;
      if ((cooldownUntil.get(pair) || 0) > now) continue;
      const signal = await checkSignal(pair, onError);
      if (signal && active) signaled.push({ pair, signal });
    }
    if (!signaled.length) return;

    // Tenta abrir nos pares com sinal, pulando os indisponíveis na corretora
    for (const { pair, signal } of signaled) {
      if (!active) return;
      if (Date.now() - lastEntryAt < minIntervalMs) break;

      const direction = signal === "put" ? "put" : "call";
      try {
        const order = await buy(pair, direction, stake, expiration, accountType);
        if (!active) return;
        lastEntryAt = Date.now();
        console.log(`[Trader User ${userId}] Ordem aberta id=${order.order_id} (${direction} ${pair} valor=${stake})`);
        if (onSignal) onSignal({ asset: pair, direction, signal });

        const startedAt = Date.now();
        const expiresAt = startedAt + Number(expiration || 1) * 60 * 1000;
        if (onOrderPlaced) onOrderPlaced({ orderId: order.order_id, asset: pair, direction, stake, startedAt, expiresAt });
        settleOrder(order.order_id, direction, pair);
        break;
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        if (looksUnavailable(msg)) {
          cooldownUntil.set(pair, Date.now() + UNAVAILABLE_COOLDOWN_MS);
          console.log(`[Trader User ${userId}] ${pair} indisponível na corretora - fora por 5 min`);
          if (onInfo) onInfo(`${pair} indisponível na corretora - fora por 5 min`);
          continue;
        }
        if (onError) onError(new Error(`Falha ao abrir ordem em ${pair}: ${msg}`));
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