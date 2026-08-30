const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, '../data/maximus.json');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!fs.existsSync(DATA_FILE)) {
      console.error('Arquivo maximus.json não encontrado em:', DATA_FILE);
      return res.status(500).json({ error: 'Banco de dados local não encontrado.' });
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const user = data.users.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verifica se a senha bate diretamente ou via bcrypt
    let isMatch = false;
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const secret = process.env.JWT_SECRET || 'secret_key';
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '1d' });

    return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });

  } catch (err) {
    console.error('ERRO NO LOGIN:', err);
    return res.status(500).json({ error: 'Erro interno no servidor ao realizar login.' });
  }
});

module.exports = router;
