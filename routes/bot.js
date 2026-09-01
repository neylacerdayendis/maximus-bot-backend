const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { startTrader } = require('../src/trader');

const DATA_FILE = path.join(__dirname, '../data/maximus.json');

// Guarda a função de parar o motor em execução (enquanto o processo estiver vivo)
let stopTraderFn = null;

// Guarda a última falha do motor (ex.: serviço de velas fora do ar) para
// mostrar no painel e evitar o "bot não inicia" sem explicação.
let lastEngineError = null;
let lastErrorAt = null;

function readData() {
  if (!fs.existsSync(DATA_FILE)) return { botStatus: 'DESLIGADO', wins: 0, losses: 0, saldo: 1000, initial_balance: 1000 };
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return {
    botStatus: data.botStatus || 'DESLIGADO',
    wins: data.wins || 0,
    losses: data.losses || 0,
    saldo: data.saldo ?? 1000,
    initial_balance: data.initial_balance ?? 1000
  };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Sempre que o processo sobe (deploy, restart, saída de hibernação), o motor em
// memória não existe mais - então força o status para DESLIGADO para não mostrar
// "Operando" com nada rodando de verdade.
(function resetStatusOnBoot() {
  if (fs.existsSync(DATA_FILE)) {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (data.botStatus === 'LIGADO') {
      data.botStatus = 'DESLIGADO';
      saveData(data);
      console.log('[bot.js] Status resetado para DESLIGADO após reinício do processo.');
    }
  }
})();

// Rota para pegar o status atual
router.get('/status', (req, res) => {
  const data = readData();
  const isRunning = (data.botStatus === 'LIGADO' || data.botStatus === true);
  
  res.json({
    running: isRunning,
    status: data.botStatus,
    wins: data.wins,
    losses: data.losses,
    current_balance: data.saldo,
    initial_balance: data.initial_balance,
    lastEngineError,
    lastErrorAt
  });
});

// Rota para Ligar o Bot
router.post('/start', async (req, res) => {
  // Já está rodando: não inicia duplicado
  if (stopTraderFn) {
    return res.json({ success: true, status: 'LIGADO', message: 'Bot já estava ligado.' });
  }

  const rawData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};

  const asset = process.env.BOT_ASSET || 'EURUSD';
  const stake = Number(process.env.BOT_STAKE || 10);
  const expiration = Number(process.env.BOT_EXPIRATION || 1);

  try {
    stopTraderFn = await startTrader({
      userId: 'default',
      asset,
      stake,
      expiration,
      onResult: (result) => {
        const current = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
        current.wins = (current.wins || 0) + (result.win ? 1 : 0);
        current.losses = (current.losses || 0) + (result.win ? 0 : 1);
        current.saldo = (current.saldo ?? 1000) + result.profit;
        saveData(current);
      },
      onError: (err) => {
        lastEngineError = err && err.message ? err.message : String(err);
        lastErrorAt = new Date().toISOString();
        console.error('[bot.js] Erro do motor:', lastEngineError);
      }
    });

    rawData.botStatus = 'LIGADO';
    saveData(rawData);

    lastEngineError = null;
    lastErrorAt = null;

    res.json({ success: true, status: 'LIGADO', message: 'Bot ligado com sucesso!' });
  } catch (err) {
    console.error('Erro ao iniciar o motor de trading:', err);
    res.status(500).json({ success: false, error: 'Falha ao iniciar o motor: ' + err.message });
  }
});

// Rota para Desligar o Bot
router.post('/stop', (req, res) => {
  const rawData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
  rawData.botStatus = 'DESLIGADO';
  saveData(rawData);

  if (stopTraderFn) {
    stopTraderFn();
    stopTraderFn = null;
  }

  lastEngineError = null;
  lastErrorAt = null;

  res.json({ success: true, status: 'DESLIGADO', message: 'Bot desligado com sucesso!' });
});

module.exports = router;