const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Middlewares para leitura de dados e CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve todos os arquivos estáticos (dashboard.html, index.html, etc.) da raiz
app.use(express.static(path.join(__dirname)));

// Importação das rotas da API
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bot');

// Registro dos prefixos de rotas
app.use('/api/auth', authRoutes);
app.use('/api/bot', botRoutes);

// Redirecionamento padrão para a rota inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor Maximus Bot rodando na porta ${PORT}`);
});
