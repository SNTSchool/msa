const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('ดูเพลงที่กำลังเล่น'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    const song = queue.songs[0];
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎵 ตอนนี้กำลังเล่น')
      .setDescription('**' + song.name + '** [' + song.formattedDuration + ']');

    interaction.reply({ embeds: [embed] });
  },
};
