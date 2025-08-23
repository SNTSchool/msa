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
  try {
    // defer ก่อนเล่นเพลง (ถ้าใช้เวลา)
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    // เล่นเพลง
    await client.distube.play(interaction.member.voice.channel, 'เพลงตัวอย่าง', {
      member: interaction.member,
      textChannel: interaction.channel
    });

    // editReply แทน reply
    await interaction.editReply('🎶 เล่นเพลงเรียบร้อยแล้ว!');

  } catch (err) {
    console.error(err);

    // เช็คอีกครั้งก่อน reply/followUp
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
    }
  }
}
};
