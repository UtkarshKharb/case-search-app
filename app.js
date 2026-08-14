const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const casesRouter = require('./routes/cases');

const app = express();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongoConnected: mongoose.connection.readyState === 1 });
});

app.use('/api', casesRouter);

// Anything under /api that wasn't matched above is a JSON 404, not the static frontend.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(express.static(path.join(__dirname, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
