const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/maximus.json');

// Função auxiliar para ler/escrever dados no JSON
function readData() {
  if (!fs.existsSync(DATA_FILE)) return { botStatus: 'DESLIGADO', wins: 0, losses: 0, saldo: 1000 };
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Rota para pegar o status atual
router.get('/status', (req, res) => {
  const data = readData();
  res.json({
    status: data.botStatus || 'DESLIGADO',
    wins: data.wins || 0,
    losses: data.losses || 0,
    saldo: data.saldo || 1000
  });
});

// Rota para Ligar o Bot
router.post('/start', (req, res) => {
  const data = readData();
  data.botStatus = 'LIGADO';
  saveData(data);
  res.json({ success: true, status: 'LIGADO', message: 'Bot ligado com sucesso!' });
});

// Rota para Desligar o Bot
router.post('/stop', (req, res) => {
  const data = readData();
  data.botStatus = 'DESLIGADO';
  saveData(data);
  res.json({ success: true, status: 'DESLIGADO', message: 'Bot desligado com sucesso!' });
});

module.exports = router;
