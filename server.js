require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const botRoutes = require("./routes/bot");
const settingsRoutes = require("./routes/settings");
const subscriptionRoutes = require("./routes/subscription");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "./")));

// Rotas da API
app.use("/api/auth", authRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/subscription", subscriptionRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor Maximus Bot rodando na porta ${PORT}`);
});
