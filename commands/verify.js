// src/commands/verify.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('ยืนยันตัวตนของผู้ใช้'),

  async execute(interaction) {
    try {
      // ✅ ป้องกัน interaction หมดอายุ
      await interaction.deferReply({ ephemeral: true });

      // 🧠 ตัวอย่างการตรวจสอบข้อมูล (mock)
      const userId = interaction.user.id;
      const isVerified = await checkUserVerification(userId); // สมมุติว่ามีฟังก์ชันนี้

      if (isVerified) {
        await interaction.editReply({
          content: '✅ คุณได้รับการยืนยันแล้ว!',
        });
      } else {
        await interaction.editReply({
          content: '❌ ไม่พบข้อมูลการยืนยันของคุณ กรุณาติดต่อผู้ดูแลระบบ',
        });
      }
    } catch (error) {
      console.error('❌ Error in verify command:', error);

      // 🛡️ fallback ป้องกัน error 40060
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '⚠️ เกิดข้อผิดพลาดในการยืนยัน กรุณาลองใหม่อีกครั้ง',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '⚠️ เกิดข้อผิดพลาดในการยืนยัน กรุณาลองใหม่อีกครั้ง',
          ephemeral: true,
        });
      }
    }
  },
};

// 🔧 mock function สำหรับตรวจสอบการยืนยัน
async function checkUserVerification(userId) {
 
  return parseInt(userId[userId.length - 1]) % 2 === 0;
}
