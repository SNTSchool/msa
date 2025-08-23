const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('ดูคิวเพลง'),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีคิวเพลง', ephemeral: true });

    const q = queue.songs.map(function(song, i) {
      return (i === 0 ? '🎶 กำลังเล่น:' : (i + '.')) + ' **' + song.name + '** [' + song.formattedDuration + ']';
    }).slice(0, 10).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📜 คิวเพลง')
      .setDescription(q);

    interaction.reply({ embeds: [embed] });
  },
};
