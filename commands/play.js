const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('เล่นเพลงจาก YouTube/Spotify/SoundCloud')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('ลิงก์หรือคำค้นหาเพลง')
        .setRequired(true)
    ),

 async execute(interaction, client) {
  const query = interaction.options.getString('query');
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: '❌ เข้าห้องเสียงก่อนนะครับ', ephemeral: true });
  }

  try {
    // ตรวจสอบ distube ก่อน
    if (!client.distube) {
      return interaction.reply({ content: '❌ Bot ยังไม่พร้อมเล่นเพลง', ephemeral: true });
    }

    await client.distube.play(voiceChannel, query, {
      textChannel: interaction.channel,
      member: member
    });

    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: '🎶 กำลังเล่น: ' + query });
    } else {
      interaction.reply({ content: '🎶 กำลังเล่น: ' + query });
    }

  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
    } else {
      interaction.reply({ content: '❌ มีข้อผิดพลาดในการเล่นเพลง', ephemeral: true });
    }
  }
},
};

