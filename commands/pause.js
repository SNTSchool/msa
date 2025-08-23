const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('หยุดเพลงชั่วคราว'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    queue.pause();
    interaction.reply({ content: '⏸️ หยุดเพลงชั่วคราวแล้ว' });
  },
};
