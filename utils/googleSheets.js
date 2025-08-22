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
    range: 'Transcript!A:A', // สมมุติว่า column A มี ticket IDs
  });

  const rows = res.data.values || [];
  const lastId = rows.length > 0 ? parseInt(rows[rows.length - 1][0]) : 0;
  console.log(lastId)
  const nextId = (lastId + 1).toString().padStart(3, '0'); // เช่น '001'
  return nextId;
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
