const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('เล่นเพลงต่อ'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    try {
      queue.resume();
      return interaction.reply({ content: '▶️ เล่นเพลงต่อแล้ว' });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: '❌ ไม่สามารถเล่นเพลงต่อได้', ephemeral: true });
    }
  },
};
