const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('หยุดเพลงและล้างคิว'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    queue.stop();
    interaction.reply({ content: '🛑 หยุดเล่นและล้างคิวแล้ว' });
  },
};
