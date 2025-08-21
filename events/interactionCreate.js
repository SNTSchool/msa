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

        // ป้องกันการตอบซ้ำ ถ้า interaction ถูกตอบไปแล้ว
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง',
            ephemeral: true
          });
        }
      }
    }

    // ปุ่ม / Modal / Logic อื่น ๆ ใส่ตรงนี้
  }
};
