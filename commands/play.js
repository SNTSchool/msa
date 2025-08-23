const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('เล่นเพลงจาก URL ของไฟล์เสียง')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('ลิงก์ตรงของไฟล์เสียง (.mp3, .ogg, .wav)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const url = interaction.options.getString('url');
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ เข้าห้องเสียงก่อนนะครับ', ephemeral: true });
    }

    try {
      await interaction.deferReply();

      if (!client.distube) {
        return interaction.editReply('❌ Bot ยังไม่พร้อมเล่นเพลง');
      }

      await client.distube.play(voiceChannel, url, {
        member: member,
        textChannel: interaction.channel
      });

      await interaction.editReply(`🎶 กำลังเล่น: \`${url}\``);
    } catch (err) {
      console.error(err);
      await interaction.editReply('❌ มีข้อผิดพลาดในการเล่นเพลง');
    }
  },
};
