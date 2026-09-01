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

// Par atualmente ativo (selecionado no painel)
let currentAsset = process.env.BOT_ASSET || 'EURUSD';

// Buffer de eventos recentes mostrados no painel (histórico em tempo real)
const MAX_EVENTS = 50;
let events = [];

function addEvent(kind, message) {
  events.push({
    id: Date.now() + Math.random().toString(36).slice(2, 6),
    kind,
    message,
    time: new Date().toISOString()
  });
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }
}

// Estado da corretora logada (persistido em maximus.json, sem expor a senha ao painel)
const BROKERS = ['IQ Option', 'Quotex', 'Binomo', 'Pocket Option', 'Expert Option'];

function readBroker() {
  if (!fs.existsSync(DATA_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return data.broker || null;
  } catch (e) {
    return null;
  }
}

function saveBroker(broker) {
  const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
  data.broker = broker;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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
  const broker = readBroker();

  res.json({
    running: isRunning,
    status: data.botStatus,
    wins: data.wins,
    losses: data.losses,
    current_balance: data.saldo,
    initial_balance: data.initial_balance,
    asset: currentAsset,
    broker: {
      broker: broker ? broker.broker : null,
      email: broker ? broker.email : null,
      logged: !!(broker && broker.broker && broker.email)
    },
    events,
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

  // Permite escolher o par pelo painel (ex.: EURUSD, GBPUSD...)
  const selectedAsset = req.body && typeof req.body.asset === 'string' ? req.body.asset.trim().toUpperCase() : null;
  const asset = selectedAsset || process.env.BOT_ASSET || 'EURUSD';
  const stake = Number(process.env.BOT_STAKE || 10);
  const expiration = Number(process.env.BOT_EXPIRATION || 1);

  currentAsset = asset;

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

        addEvent(result.win ? 'win' : 'loss',
          `${result.win ? 'WIN' : 'LOSS'} ${result.action} ${result.asset} | R$ ${result.profit.toFixed(2)} | Saldo R$ ${current.saldo.toFixed(2)}`);
      },
      onError: (err) => {
        lastEngineError = err && err.message ? err.message : String(err);
        lastErrorAt = new Date().toISOString();
        addEvent('error', 'Erro no motor de sinais: ' + lastEngineError);
        console.error('[bot.js] Erro do motor:', lastEngineError);
      }
    });

    rawData.botStatus = 'LIGADO';
    saveData(rawData);

    lastEngineError = null;
    lastErrorAt = null;
    addEvent('info', `Bot iniciado no par ${asset}`);

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
  addEvent('info', 'Bot parado');

  res.json({ success: true, status: 'DESLIGADO', message: 'Bot desligado com sucesso!' });
});

// Rota para consultar a corretora logada (sem expor a senha)
router.get('/broker', (req, res) => {
  const b = readBroker();
  res.json({
    broker: b ? b.broker : null,
    email: b ? b.email : null,
    logged: !!(b && b.broker && b.email)
  });
});

// Rota para salvar corretora e credenciais (a senha fica no servidor e não é devolvida)
router.post('/broker', (req, res) => {
  const { broker, email, password } = req.body || {};
  const brokerName = BROKERS.includes(broker) ? broker : (typeof broker === 'string' ? broker : null);

  if (!brokerName) {
    return res.status(400).json({ success: false, error: 'Selecione uma corretora válida.' });
  }
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ success: false, error: 'Informe um e-mail válido.' });
  }
  if (!password) {
    return res.status(400).json({ success: false, error: 'Informe a senha da corretora.' });
  }

  saveBroker({
    broker: brokerName,
    email: String(email).trim(),
    // Ofuscado: base64 reversível para uso pelo serviço, evita texto puro óbvio
    password: Buffer.from(String(password)).toString('base64'),
    loggedAt: new Date().toISOString()
  });

  addEvent('info', `Conectado à corretora ${brokerName} (${String(email).trim()})`);
  res.json({ success: true, broker: brokerName, email: String(email).trim(), message: 'Corretora configurada com sucesso!' });
});

module.exports = router;