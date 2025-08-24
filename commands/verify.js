const { SlashCommandBuilder } = require('discord.js');
const { addPending } = require('../utils/pending');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันบัญชี Roblox ของคุณ')
    .addStringOption(opt =>
      opt.setName('roblox_username')
         .setDescription('ชื่อผู้ใช้ Roblox ของคุณ')
         .setRequired(true)
    ),
  async execute(interaction) {
    const robloxUsername = interaction.options.getString('roblox_username');
    const discordId = interaction.user.id;

    addPending(discordId, robloxUsername);

    await interaction.reply({
      content: `✅ กรุณาเข้าเกม Roblox เพื่อยืนยันบัญชีของคุณ (${robloxUsername}) ภายใน 10 นาที`,
      ephemeral: true
    });
  }
};
