const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('หยุดเพลงชั่วคราว'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    try {
      queue.pause();
      return interaction.reply({ content: '⏸️ หยุดเพลงชั่วคราวแล้ว' });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: '❌ ไม่สามารถหยุดเพลงได้', ephemeral: true });
    }
  },
};
