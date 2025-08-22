const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

/**
 * เพิ่มข้อมูลลงในแถวใหม่ของชีต
 * @param {string} spreadsheetId - รหัสชีต
 * @param {Array} values - ข้อมูลที่ต้องการเพิ่ม
 */
async function appendRow(spreadsheetId, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Transcript!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

/**
 * สร้าง Ticket ID ถัดไปในรูปแบบ Order-<เลข>
 * โดยดูจากคอลัมน์ A ที่ชื่อว่า Ticket ID
 * @param {string} spreadsheetId - รหัสชีต
 * @returns {string} - Ticket ID ใหม่
 */
async function getNextTicketId(sheet) {
  const rows = await sheet.getRows();
  const lastRow = rows[rows.length - 1];
  const lastId = lastRow?.TicketID?.match(/\d+$/)?.[0] || '000';
  const nextId = parseInt(lastId, 10) + 1;
  return String(nextId).padStart(3, '0'); // Return only numeric part
}

module.exports = {
  appendRow,
  getNextTicketId
};
