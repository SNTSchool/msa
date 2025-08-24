const { SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันตัวตนของคุณ'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // ป้องกัน timeout และแสดงเฉพาะผู้ใช้

    const userId = interaction.user.id;
    const username = interaction.user.username;

    try {
      const response = await fetch(`https://msa-ebw0.onrender.com/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        await interaction.editReply({
          content: `✅ ยืนยันสำเร็จสำหรับ <@${userId}> (${username})`
        });
      } else {
        await interaction.editReply({
          content: `⚠️ ไม่สามารถยืนยันได้: ${result.message || 'ไม่ทราบสาเหตุ'}`
        });
      }

    } catch (error) {
      console.error('Verify error:', error);
      await interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการยืนยัน: ${error.message}`
      });
    }
  }
};
