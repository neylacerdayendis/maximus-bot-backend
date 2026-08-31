const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Desativa restrições de CSP para permitir execução limpa do painel no navegador
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
  );
  next();
});

// Serve o arquivo dashboard.html e outros estáticos
app.use(express.static(path.join(__dirname)));

// Registra as rotas da API
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/bot'));

// Direciona a raiz para o dashboard.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Garante que a rota /dashboard também entregue a página
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});