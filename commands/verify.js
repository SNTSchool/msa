const { SlashCommandBuilder } = require('discord.js');
const verifyStatus = require('../verifyStatus'); // ใช้ shared map

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันตัวตนของคุณผ่านระบบ')
    .addStringOption(option =>
      option.setName('roblox_username')
        .setDescription('ชื่อผู้ใช้ Roblox ของคุณ')
        .setRequired(true)),

  async execute(interaction) {
   // await interaction.deferReply({ ephemeral: true });

    const discordUserId = interaction.user.id;
    const robloxUsername = interaction.options.getString('roblox_username');

    verifyStatus.set(discordUserId, {
      robloxUsername,
      verified: true,
      enteredGame: false
    });

   // await interaction.editReply(`✅ ยืนยัน Roblox username: **${robloxUsername}** แล้ว! กรุณาเข้าเกมเพื่อยืนยันขั้นสุดท้าย`);
  }
};
