const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('เล่นเพลงต่อ'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    queue.resume();
    interaction.reply({ content: '▶️ เล่นเพลงต่อแล้ว' });
  },
};
