const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { startTrader } = require('../src/trader');
const { fetchBalance } = require('../src/candle-client');

const DATA_FILE = path.join(__dirname, '../data/maximus.json');

// Guarda a função de parar o motor em execução (enquanto o processo estiver vivo)
let stopTraderFn = null;

// Guarda a última falha do motor (ex.: serviço de velas fora do ar) para
// mostrar no painel e evitar o "bot não inicia" sem explicação.
let lastEngineError = null;
let lastErrorAt = null;

// Par atualmente ativo (selecionado no painel)
let currentAsset = process.env.BOT_ASSET || 'EURUSD';

// Conta atualmente ativa (PRACTICE/REAL)
let currentAccountType = process.env.BOT_ACCOUNT_TYPE || 'PRACTICE';

// Valor da ordem (stake) e expiração atualmente ativos
let currentStake = Number(process.env.BOT_STAKE || 10);
let currentExpiration = Number(process.env.BOT_EXPIRATION || 1);

// Operação atualmente aberta (para o cronômetro no painel)
let currentOrder = null;

// Limites de ganho/perda que param o bot automaticamente (null = sem limite)
let currentTakeProfit = null;
let currentStopLoss = null;

// Saldo inicial da sessão (para calcular ganho/perda relativo)
let sessionStartBalance = null;

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
router.get('/status', async (req, res) => {
  const data = readData();
  const isRunning = (data.botStatus === 'LIGADO' || data.botStatus === true);
  const broker = readBroker();

  // Tenta buscar o saldo real da conta IQ Option (não bloqueia o status)
  let iqBalance = null;
  let iqAccount = null;
  let iqBalanceError = null;
  try {
    const bal = await fetchBalance(currentAccountType);
    if (bal && typeof bal.balance === 'number') {
      iqBalance = bal.balance;
      iqAccount = bal.account || currentAccountType;
    } else {
      iqBalanceError = bal && bal.error ? bal.error : 'sem saldo';
    }
  } catch (e) {
    iqBalanceError = e && e.message ? e.message : String(e);
  }

  res.json({
    running: isRunning,
    status: data.botStatus,
    wins: data.wins,
    losses: data.losses,
    current_balance: data.saldo,
    initial_balance: data.initial_balance,
    asset: currentAsset,
    accountType: currentAccountType,
    stake: currentStake,
    expiration: currentExpiration,
    takeProfit: currentTakeProfit,
    stopLoss: currentStopLoss,
    currentOrder,
    iq_balance: iqBalance,
    iq_account: iqAccount,
    iq_balance_error: iqBalanceError,
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

  // Valor da ordem (stake) e expiração escolhidos no painel (fallback: env)
  const rawStake = req.body && req.body.stake != null ? Number(req.body.stake) : NaN;
  const rawExpiry = req.body && req.body.expiration != null ? Number(req.body.expiration) : NaN;
  const stake = Number.isFinite(rawStake) && rawStake > 0 ? rawStake : Number(process.env.BOT_STAKE || 10);
  const expiration = Number.isFinite(rawExpiry) && rawExpiry > 0 ? rawExpiry : Number(process.env.BOT_EXPIRATION || 1);
  currentStake = stake;
  currentExpiration = expiration;

  // Conta (practice/real) escolhida no painel
  const accountType = req.body && typeof req.body.account_type === 'string'
    ? req.body.account_type.trim().toUpperCase()
    : (process.env.BOT_ACCOUNT_TYPE || 'PRACTICE');

  // Limites de ganho/perda (R$) que param o bot automaticamente
  const rawTP = req.body && req.body.take_profit != null ? Number(req.body.take_profit) : NaN;
  const rawSL = req.body && req.body.stop_loss != null ? Number(req.body.stop_loss) : NaN;
  currentTakeProfit = Number.isFinite(rawTP) && rawTP > 0 ? rawTP : null;
  currentStopLoss = Number.isFinite(rawSL) && rawSL > 0 ? rawSL : null;

  currentAsset = asset;
  currentAccountType = accountType;

  // Define o saldo inicial a partir do saldo real da IQ Option (se possível)
  let initialSaldo = Number(rawData.saldo ?? rawData.initial_balance ?? 1000);
  try {
    const bal = await fetchBalance(accountType);
    if (bal && typeof bal.balance === 'number' && isFinite(bal.balance)) {
      initialSaldo = bal.balance;
      rawData.saldo = bal.balance;
      rawData.initial_balance = bal.balance;
    }
  } catch (e) {
    // se falhar, mantém o saldo salvo
  }
  sessionStartBalance = initialSaldo;

  try {
    stopTraderFn = await startTrader({
      userId: 'default',
      asset,
      stake,
      expiration,
      accountType,
      onResult: (result) => {
        const current = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
        current.wins = (current.wins || 0) + ((result.win && result.status !== 'draw') ? 1 : 0);
        current.losses = (current.losses || 0) + ((!result.win && result.status !== 'draw') ? 1 : 0);

        // Tenta usar o saldo real da IQ como base; senão, calcula virtualmente
        const saldoReal = result.balance != null && isFinite(result.balance)
          ? result.balance
          : ((current.saldo ?? 1000) + result.profit);
        current.saldo = saldoReal;
        saveData(current);

        const label = result.status === 'draw' ? 'EMPATE' : (result.win ? 'WIN' : 'LOSS');
        addEvent(label.toLowerCase(),
          `${label} ${result.action} ${result.asset} | R$ ${result.profit.toFixed(2)} | Saldo R$ ${current.saldo.toFixed(2)}`);

        // Verifica limites de ganho/perda e desliga o bot se atingir a meta
        if (sessionStartBalance != null && (currentTakeProfit != null || currentStopLoss != null)) {
          const gain = saldoReal - sessionStartBalance;
          let reason = null;
          if (currentStopLoss != null && gain <= -currentStopLoss) {
            reason = `perda de R$ ${Math.abs(gain).toFixed(2)} (limite R$ ${currentStopLoss.toFixed(2)})`;
          } else if (currentTakeProfit != null && gain >= currentTakeProfit) {
            reason = `ganho de R$ ${gain.toFixed(2)} (meta R$ ${currentTakeProfit.toFixed(2)})`;
          }
          if (reason) {
            try {
              if (stopTraderFn) { stopTraderFn(); stopTraderFn = null; }
            } catch (e) {}
            rawData.botStatus = 'DESLIGADO';
            saveData(rawData);
            addEvent('info', `Bot parado automaticamente: atingiu ${reason}`);
            console.log('[bot.js] Stop automático:', reason);
          }
        }
      },
      onError: (err) => {
        lastEngineError = err && err.message ? err.message : String(err);
        lastErrorAt = new Date().toISOString();
        addEvent('error', 'Erro no motor de sinais: ' + lastEngineError);
        console.error('[bot.js] Erro do motor:', lastEngineError);
      },
      onOrderPlaced: (ord) => {
        currentOrder = {
          orderId: ord.orderId,
          asset: ord.asset,
          direction: ord.direction,
          stake: ord.stake,
          startedAt: ord.startedAt,
          expiresAt: ord.expiresAt
        };
        addEvent('info', `Ordem aberta: ${ord.direction.toUpperCase()} ${ord.asset} valor=R$${Number(ord.stake).toFixed(2)}`);
      },
      onOrderClosed: (ord) => {
currentOrder = null;
  currentTakeProfit = null;
  currentStopLoss = null;
  sessionStartBalance = null;
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
  currentOrder = null;

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