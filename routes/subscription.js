const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

// GET /api/subscription
router.get("/", auth, (req, res) => {
  const user = db.get("users").find({ id: req.user.id }).value();
  res.json({ plan: user ? user.plan : "free", active: true });
});

module.exports = router;
