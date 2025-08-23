const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('เล่นเพลงจาก URL ของไฟล์หรือ Spotify public track')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('ลิงก์ไฟล์เพลงหรือ Spotify track')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({ content: '❌ คุณต้องเข้าห้องเสียงก่อน', ephemeral: true });
    }

    try {
      // ป้องกัน interaction หมดอายุ
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (!client.distube) {
        return interaction.editReply('❌ Bot ยังไม่พร้อมเล่นเพลง');
      }

      // เล่นเพลงจาก URL ตรงหรือ Spotify public
      await client.distube.play(voiceChannel, query, {
        member: member,
        textChannel: interaction.channel
      });

      await interaction.editReply(`🎶 กำลังเล่น: \`${query}\``);

    } catch (err) {
      console.error(err);

      // reply/followUp แบบปลอดภัย
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
      }
    }
  },
};
