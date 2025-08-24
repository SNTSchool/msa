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

const spreadsheetId = process.env.SPREADSHEET_ID;


/**
 * ดึง Ticket ID ถัดไปจาก Sheet
 */
async function getNextTicketId(spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Transcript!A:A',
  });

  const rows = res.data.values || [];
  const ticketIds = rows
    .map(row => row[0])
    .filter(cell => /^Order-\d+$/.test(cell));

  const lastId = ticketIds.length
    ? parseInt(ticketIds[ticketIds.length - 1].match(/\d+$/)[0], 10)
    : 0;

  return String(lastId + 1).padStart(3, '0'); // '001', '002', ...
}

/**
 * เพิ่มแถวใหม่ตอนสร้าง Ticket
 */
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

/**
 * อัปเดตข้อมูล Ticket ตอนปิด เช่น transcript, เหตุผล, timestamp
 */
async function updateTicketRow(spreadsheetId, ticketId, updates) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Transcript!A1:I',
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === `Order-${ticketId}`);

  if (rowIndex === -1) {
    throw new Error(`Ticket Order-${ticketId} not found`);
  }

  const row = rows[rowIndex];

  const fieldMap = {
    status: 4,
    reason: 6,
    transcript: 7,
    closedAt: 8,
  };

  for (const [key, value] of Object.entries(updates)) {
    const colIndex = fieldMap[key];
    if (colIndex !== undefined) {
      row[colIndex] = value;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Transcript!A${rowIndex + 1}:I${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  });
}

/**
 * บันทึกการยืนยันบัญชี Roblox ลง Google Sheet
 */
async function appendVerification(discordName, robloxUsername, timestamp, spreadsheetId) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Verifydata!A2:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[discordName, robloxUsername, timestamp]],
      },
    });
    console.log(`✅ บันทึกการยืนยันของ ${discordName} (${robloxUsername})`);
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดในการบันทึกการยืนยัน:', err);
  }
}

module.exports = {
  getNextTicketId,
  appendRow,
  updateTicketRow,
  appendVerification,
};
