const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('ปรับระดับเสียง (0-100)')
    .addIntegerOption(option =>
      option.setName('percent')
        .setDescription('เปอร์เซ็นต์เสียง')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) return interaction.reply({ content: '❌ ไม่มีเพลงกำลังเล่น', ephemeral: true });

    const volume = interaction.options.getInteger('percent');
    if (volume < 0 || volume > 100) return interaction.reply({ content: '❌ ใส่ค่าได้แค่ 0-100', ephemeral: true });

    queue.setVolume(volume);
    interaction.reply({ content: '🔊 ปรับเสียงเป็น ' + volume + '% แล้ว' });
  },
};
