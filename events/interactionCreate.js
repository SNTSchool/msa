module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true });
      }
    }

    // ปุ่ม / Modal / Logic อื่น ๆ ใส่ตรงนี้
  }
};
