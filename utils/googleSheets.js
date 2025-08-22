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
    range: 'Transcript!A:A', // หรือ Transcript!A:A แล้วแต่ชื่อ sheet
  });

  const rows = res.data.values || [];

  // ลบ header ถ้ามี
  const dataRows = rows.filter(row => /^\d+$/.test(row[0]));

  const lastId = dataRows.length > 0
    ? parseInt(dataRows[dataRows.length - 1][0], 10)
    : 0;

  const nextId = lastId + 1;
  console.log('Rows:', rows);
console.log('Last ID:', lastId);
console.log('Next ID:', nextId);
  return String(nextId).padStart(3, '0'); // เช่น '001'
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
