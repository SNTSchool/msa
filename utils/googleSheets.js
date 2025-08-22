const { google } = require('googleapis');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function getNextTicketId(spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Transcript!A:A', // หรือชื่อ sheet ที่คุณใช้จริง
  });

  const rows = res.data.values || [];

  // กรองเฉพาะแถวที่มีรูปแบบ 'Order-xxx'
  const dataRows = rows
    .map(row => row[0])
    .filter(cell => /^Order-\d+$/.test(cell));

  // ดึงเลขจากแถวสุดท้าย
  const lastRaw = dataRows[dataRows.length - 1];
  const lastId = lastRaw ? parseInt(lastRaw.match(/\d+$/)[0], 10) : 0;

  const nextId = lastId + 1;
  return String(nextId).padStart(3, '0'); // return '001', '002', ...
}

async function appendRow(spreadsheetId, rowData) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Transcript!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData],
    },
  });
}

module.exports = { getNextTicketId, appendRow };
