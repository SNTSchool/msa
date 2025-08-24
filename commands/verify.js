const { SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันตัวตนของคุณผ่านระบบ /verify API')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('ชื่อผู้ใช้ Roblox ของคุณ')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('User ID ของคุณใน Roblox')
        .setRequired(true)),

  async execute(interaction) {
    const username = interaction.options.getString('username');
    const userId = interaction.options.getString('userid');

    try {
      const response = await fetch(`${process.env.API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, userId })
      });

      const result = await response.json();

      if (result.success) {
        await interaction.reply({
          content: `✅ ยืนยันสำเร็จสำหรับ **${username}** (ID: ${userId})`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ ไม่สามารถยืนยันได้: ${result.message || 'ไม่ทราบสาเหตุ'}`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('🚨 API error:', error);
      await interaction.reply({
        content: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบยืนยัน 😢',
        ephemeral: true
      });
    }
  }
};
