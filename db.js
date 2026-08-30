const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "maximus.json");
const adapter = new FileSync(dbPath);
const db = low(adapter);

// Inicializar padrão se estiver vazio
db.defaults({
  users: [],
  botSettings: [],
  botStatus: [],
  botSignals: [],
  nextUserId: 1,
  nextSignalId: 1
}).write();

module.exports = db;
