const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
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
async function getNextTicketId(spreadsheetId) {
  const range = 'Transcript!A:A';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const rows = res.data.values || [];

  // ลบ header ถ้ามี
  const dataRows = rows.filter(row => row[0] !== 'Ticket ID');

  // ดึงเลขล่าสุด
  const lastId = dataRows.length > 0
    ? parseInt(dataRows[dataRows.length - 1][0])
    : 0;

  const nextId = lastId + 1;

  return `Order-${String(nextId).padStart(3, '0')}`;
}

module.exports = {
  appendRow,
  getNextTicketId
};
