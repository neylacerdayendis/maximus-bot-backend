const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }

    const existingUser = db.get("users").find({ email }).value();
    if (existingUser) {
      return res.status(400).json({ message: "E-mail já cadastrado." });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    const nextId = db.get("nextUserId").value() || 1;
    const newUser = {
      id: nextId,
      name: name || "Usuário",
      email,
      password_hash,
      plan: "free",
      createdAt: new Date().toISOString()
    };

    db.get("users").push(newUser).write();
    db.set("nextUserId", nextId + 1).write();

    // Criar configurações padrão do bot
    db.get("botSettings").push({
      userId: newUser.id,
      stake: 10,
      asset: "EURUSD",
      expiration: 1,
      martingale_levels: 2
    }).write();

    // Criar status inicial do bot
    db.get("botStatus").push({
      userId: newUser.id,
      running: false,
      initial_balance: 1000,
      current_balance: 1000,
      wins: 0,
      losses: 0
    }).write();

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, process.env.JWT_SECRET || "maximus_secret_key_2026", { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, plan: newUser.plan } });
  } catch (error) {
    res.status(500).json({ message: "Erro no servidor ao registrar usuário." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.get("users").find({ email }).value();
    if (!user) {
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "maximus_secret_key_2026", { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
  } catch (error) {
    res.status(500).json({ message: "Erro no servidor ao realizar login." });
  }
});

// GET /api/auth/me
router.get("/me", require("../middleware/auth"), (req, res) => {
  const user = db.get("users").find({ id: req.user.id }).value();
  if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
  
  const { password_hash, ...userData } = user;
  res.json(userData);
});

module.exports = router;
