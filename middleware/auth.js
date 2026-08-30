const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const token = req.header("x-auth-token") || req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Sem token, autorização negada." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "maximus_secret_key_2026");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token inválido." });
  }
};
