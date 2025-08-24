const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 10000;

// Middleware สำหรับอ่าน JSON และ form data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// GET /verify → แสดงฟอร์ม HTML
app.get('/verify', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Verify</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f9f9f9; }
          form { background: white; padding: 20px; border-radius: 8px; max-width: 400px; margin: auto; }
          input, button { margin-top: 10px; width: 100%; padding: 8px; }
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

// POST /verify → รับข้อมูลจาก Roblox หรือฟอร์ม
app.post('/verify', async (req, res) => {
  const { username, userId } = req.body;

  // ตรวจสอบข้อมูลเบื้องต้น
  if (!username || !userId) {
    return res.status(400).json({ success: false, message: 'Missing username or userId' });
  }

  // ตัวอย่างการ log ข้อมูล (สามารถเชื่อม Google Sheets ได้)
  console.log(`✅ Verified: ${username} (${userId})`);

  // ตอบกลับแบบ JSON สำหรับ Roblox หรือ API
  if (req.headers['content-type'] === 'application/json') {
    return res.json({ success: true, message: 'Verified via API' });
  }

  // ตอบกลับแบบ HTML สำหรับฟอร์ม
  res.send(`
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
});

// fallback route
app.use((req, res) => {
  res.status(404).send('❌ Route not found');
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
