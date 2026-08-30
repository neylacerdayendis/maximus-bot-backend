const db = require("../../db");
const { startTrader } = require("../trader");

const runningBots = new Map();

async function startBot(userId) {
  if (runningBots.has(userId)) return;

  const settings = db.get("botSettings").find({ userId }).value();
  if (!settings) throw new Error("Configurações do bot não encontradas.");

  const stopFn = await startTrader({
    userId,
    asset: settings.asset || "EURUSD",
    stake: settings.stake || 10,
    expiration: settings.expiration || 1,
    onResult: (result) => registerSignal(userId, result)
  });

  runningBots.set(userId, stopFn);
}

async function stopBot(userId) {
  if (runningBots.has(userId)) {
    const stopFn = runningBots.get(userId);
    if (typeof stopFn === "function") stopFn();
    runningBots.delete(userId);
  }
}

function registerSignal(userId, result) {
  const nextId = db.get("nextSignalId").value() || 1;
  const signal = {
    id: nextId,
    userId,
    asset: result.asset,
    action: result.action,
    result: result.win ? "WIN" : "LOSS",
    profit: result.profit,
    timestamp: new Date().toISOString()
  };

  db.get("botSignals").push(signal).write();
  db.set("nextSignalId", nextId + 1).write();

  const status = db.get("botStatus").find({ userId }).value();
  if (status) {
    const wins = status.wins + (result.win ? 1 : 0);
    const losses = status.losses + (result.win ? 0 : 1);
    const current_balance = status.current_balance + result.profit;

    db.get("botStatus")
      .find({ userId })
      .assign({ wins, losses, current_balance })
      .write();
  }
}

module.exports = { startBot, stopBot };
