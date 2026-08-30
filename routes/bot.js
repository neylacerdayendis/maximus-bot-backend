const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");
const botEngine = require("../src/botEngine");

// GET /api/bot/status
router.get("/status", auth, (req, res) => {
  const status = db.get("botStatus").find({ userId: req.user.id }).value();
  res.json(status || { running: false, initial_balance: 1000, current_balance: 1000, wins: 0, losses: 0 });
});

// POST /api/bot/start
router.post("/start", auth, async (req, res) => {
  try {
    await botEngine.startBot(req.user.id);
    db.get("botStatus").find({ userId: req.user.id }).assign({ running: true }).write();
    res.json({ message: "Bot iniciado com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao iniciar o bot.", error: err.message });
  }
});

// POST /api/bot/stop
router.post("/stop", auth, async (req, res) => {
  try {
    await botEngine.stopBot(req.user.id);
    db.get("botStatus").find({ userId: req.user.id }).assign({ running: false }).write();
    res.json({ message: "Bot parado com sucesso." });
  } catch (err) {
    res.status(500).json({ message: "Erro ao parar o bot.", error: err.message });
  }
});

// GET /api/bot/signals
router.get("/signals", auth, (req, res) => {
  const signals = db.get("botSignals").filter({ userId: req.user.id }).value();
  res.json(signals || []);
});

module.exports = router;
