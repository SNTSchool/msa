const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('เล่นเพลงจาก YouTube / Spotify / SoundCloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('ลิงก์หรือคำค้นหาเพลง')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query', true);
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ เข้าห้องเสียงก่อนนะครับ', ephemeral: true });
    }

    try {
      await client.distube.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member: interaction.member,
      });

      return interaction.reply({ content: `🎶 เพิ่มเข้าคิว: **${query}**` });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: '❌ เล่นเพลงไม่ได้', ephemeral: true });
    }
  },
};
