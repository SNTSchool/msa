const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('ข้ามเพลงที่กำลังเล่น'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    try {
      queue.skip();
      interaction.reply({ content: '⏭️ ข้ามเพลงแล้ว' });
    } catch (error) {
      console.error(error);
      interaction.reply({ content: '❌ ไม่มีเพลงถัดไป', ephemeral: true });
    }
  },
};
