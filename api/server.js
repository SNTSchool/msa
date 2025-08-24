// server.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Route: /verify
app.get('/verify', (req, res) => {
  res.json({ status: 'ok', message: 'API is working properly' });
});

// ✅ Fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
