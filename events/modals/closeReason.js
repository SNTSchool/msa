const { appendRow } = require('../../utils/googleSheets');

async function handleCloseModal(interaction) {
  const ticketId = interaction.customId.split('_')[1];
  const reason = interaction.fields.getTextInputValue('reason');
  const channel = interaction.channel;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = messages
      .filter(m => !m.author.bot)
      .map(m => `${m.author.tag}: ${m.content}`)
      .reverse()
      .join('\n');

    await appendRow(process.env.SPREADSHEET_ID, [
      ticketId,
      interaction.user.tag,
      reason,
      transcript,
      new Date().toISOString()
    ]);

    await interaction.reply({ content: '✅ Ticket ถูกปิดและบันทึกเรียบร้อยแล้ว', ephemeral: true });
    await channel.delete();
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการปิด Ticket', ephemeral: true });
  }
}

module.exports = handleCloseModal;
