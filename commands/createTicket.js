const { getNextTicketId, appendRow } = require('../utils/googleSheets');

async function createTicket(interaction, item, details) {
  const ticketId = await getNextTicketId(process.env.SPREADSHEET_ID);
  const rowData = [
    `Order-${ticketId}`,
    interaction.user.tag,
    item,
    details,
    'Open',
    new Date().toISOString(),
    '', '', ''
  ];
  await appendRow(process.env.SPREADSHEET_ID, rowData);
  return ticketId;
}

module.exports = { createTicket };
