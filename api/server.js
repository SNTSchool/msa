// api/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 10000;

// ✅ Middleware
app.use(cors()); // อนุญาตทุก origin (ปรับตามต้องการ)
app.use(bodyParser.json()); // รองรับ JSON body
app.use(bodyParser.urlencoded({ extended: true })); // รองรับ form data

// ✅ GET /verify → แสดงฟอร์ม HTML
app.get('/verify', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Verify</title>
        <style>
          body { font-family: sans-serif; background: #f0f0f0; padding: 40px; }
          form { background: white; padding: 20px; border-radius: 8px; max-width: 400px; margin: auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          input, button { margin-top: 10px; width: 100%; padding: 10px; font-size: 16px; }
        </style>
      </head>
      <body>
        <h2>🔐 Verification Form</h2>
        <form method="POST" action="/verify">
          <label for="username">Username:</label>
          <input type="text" id="username" name="username" required />

          <label for="userId">User ID:</label>
          <input type="text" id="userId" name="userId" required />

          <button type="submit">Submit</button>
        </form>
      </body>
    </html>
  `);
});

// ✅ POST /verify → รับข้อมูลจาก Roblox หรือฟอร์ม
app.post('/verify', async (req, res) => {
  const { username, userId } = req.body;

  // 🔍 ตรวจสอบข้อมูล
  if (!username || !userId) {
    return res.status(400).json({ success: false, message: 'Missing username or userId' });
  }

  // ✅ ตัวอย่างการตรวจสอบ (ต่อยอดเชื่อม Google Sheets/database ได้)
  console.log(`✅ Verification received: ${username} (${userId})`);

  // 🔁 ตอบกลับตามประเภท request
  const isJson = req.headers['content-type']?.includes('application/json');

  if (isJson) {
    return res.json({ success: true, message: 'Verified via API' });
  } else {
    return res.send(`
      <html>
        <head><title>Verified</title></head>
        <body>
          <h2>✅ Verification Successful</h2>
          <p>Username: <strong>${username}</strong></p>
          <p>User ID: <strong>${userId}</strong></p>
          <a href="/verify">Back</a>
        </body>
      </html>
    `);
  }
});

// ✅ fallback สำหรับ route ที่ไม่มี
app.use((req, res) => {
  res.status(404).send('❌ Route not found');
});

// ✅ เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
