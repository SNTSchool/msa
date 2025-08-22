const { updateTicketRow } = require('../utils/googlesheets');

async function closeTicket(ticketId, reason, transcript) {
  await updateTicketRow(process.env.SPREADSHEET_ID, ticketId, {
    status: 'Closed',
    reason,
    transcript,
    closedAt: new Date().toISOString(),
  });
}

module.exports = { closeTicket };
