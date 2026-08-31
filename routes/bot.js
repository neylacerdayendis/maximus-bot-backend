const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/maximus.json');

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
    initial_balance: data.initial_balance
  });
});

// Rota para Ligar o Bot
router.post('/start', (req, res) => {
  const rawData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
  rawData.botStatus = 'LIGADO';
  saveData(rawData);
  res.json({ success: true, status: 'LIGADO', message: 'Bot ligado com sucesso!' });
});

// Rota para Desligar o Bot
router.post('/stop', (req, res) => {
  const rawData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : {};
  rawData.botStatus = 'DESLIGADO';
  saveData(rawData);
  res.json({ success: true, status: 'DESLIGADO', message: 'Bot desligado com sucesso!' });
});

module.exports = router;