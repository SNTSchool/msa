// server.js
const express = require('express');
const app = express();

// ✅ Middleware
app.use(express.json());

// ✅ Routes
app.get('/', (req, res) => {
 res.json({ status: 'ok' });
});

// ✅ Export app for external use
module.exports = app;
