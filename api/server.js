// api/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 10000

// ✅ Middleware
app.use(cors()); // อนุญาตทุก origin (ปรับตามต้องการ)
app.use(bodyParser.json()); // รองรับ JSON body
app.use(bodyParser.urlencoded({ extended: true })); // รองรับ form data

app.get('/verify', (req, res) => {
  res.send('✅ ระบบยืนยันพร้อมใช้งาน');
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


