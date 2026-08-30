const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

// GET /api/settings
router.get("/", auth, (req, res) => {
  const settings = db.get("botSettings").find({ userId: req.user.id }).value();
  res.json(settings || {});
});

// PUT /api/settings
router.put("/", auth, (req, res) => {
  const { stake, asset, expiration, martingale_levels, broker_token } = req.body;
  let settings = db.get("botSettings").find({ userId: req.user.id }).value();

  if (settings) {
    db.get("botSettings")
      .find({ userId: req.user.id })
      .assign({ stake, asset, expiration, martingale_levels, broker_token })
      .write();
  } else {
    db.get("botSettings")
      .push({ userId: req.user.id, stake, asset, expiration, martingale_levels, broker_token })
      .write();
  }

  res.json({ message: "Configurações atualizadas com sucesso." });
});

module.exports = router;
