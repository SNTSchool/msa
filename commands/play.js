const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('เล่นเพลงจาก YouTube หรือ Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('ลิงก์หรือคำค้นหาเพลง')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ เข้าห้องเสียงก่อนนะครับ', ephemeral: true }).catch(() => {});
    }

    // deferReply ป้องกัน interaction หมดอายุ
    await interaction.deferReply({ ephemeral: false }).catch(() => {});

    if (!client.distube) {
      return interaction.editReply('❌ Bot ยังไม่พร้อมเล่นเพลง').catch(() => {});
    }

    try {
      await client.distube.play(voiceChannel, query, {
        member: member,
        textChannel: interaction.channel
      });

      await interaction.editReply(`🎶 กำลังเล่น: \`${query}\``).catch(() => {});

    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ มีข้อผิดพลาดในการเล่นเพลง').catch(() => {});
    }
  },
};
