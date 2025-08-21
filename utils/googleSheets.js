const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

async function appendRow(spreadsheetId, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Transcript!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

module.exports = { appendRow };
