const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'OK' }));
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

module.exports = app;