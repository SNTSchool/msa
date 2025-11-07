const { SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-desc')
    .setDescription('ตรวจสอบ Description ใน Roblox profile เพื่อยืนยัน (สำหรับ Verify via Description)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const userId = interaction.user.id;
      const verifyStatus = global.verifyStatus;
      if (!verifyStatus) {
        return interaction.editReply('❌ ระบบยืนยันไม่พร้อม (verifyStatus missing). ติดต่อแอดมิน');
      }

      const entry = verifyStatus.get(userId);
      if (!entry || !entry.verified || entry.method !== 'description') {
        return interaction.editReply('⚠️ คุณยังไม่ได้เริ่มการยืนยันแบบ description หรือข้อมูลไม่ครบ กรุณากดปุ่ม Verify via Description ก่อนแล้วกรอกชื่อ Roblox');
      }

      const expectedPhrase = entry.phrase;
      const robloxUsername = entry.robloxUsername;
      if (!robloxUsername || !expectedPhrase)
        return interaction.editReply('❌ ข้อมูลการยืนยันไม่ครบ (username หรือ phrase หาย).');

      // หา Roblox userId
      const resId = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: true })
      });
      const dataId = await resId.json();
      if (!dataId || !dataId.data || dataId.data.length === 0) {
        return interaction.editReply('❌ ไม่พบผู้ใช้ Roblox ที่ระบุ');
      }
      const robloxId = dataId.data[0].id;

      // ดึงข้อมูลโปรไฟล์ Roblox
      const profileRes = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
      const profile = await profileRes.json();
      const description = profile && profile.description ? profile.description : '';

      if (description.includes(expectedPhrase)) {
        try {
          if (global.appendVerifyRow)
            await global.appendVerifyRow(userId, robloxUsername, 'Description');
        } catch (e) {
          console.warn('appendVerifyRow failed', e);
        }

        entry.enteredGame = true;
        verifyStatus.set(userId, entry);

        return interaction.editReply(`✅ ยืนยันสำเร็จสำหรับ **${robloxUsername}**\n\nพบข้อความที่ตรงกันใน Description 🎉`);
      } else {
        return interaction.editReply(`❌ ไม่พบ phrase ใน Description ของ ${robloxUsername}\n\nโปรดตรวจสอบว่าได้ตั้ง Description เป็นข้อความนี้หรือไม่:\n\`\`\`${expectedPhrase}\`\`\``);
      }
    } catch (err) {
      console.error('verify-desc command error', err);
      return interaction.editReply('⚠️ เกิดข้อผิดพลาดในการตรวจสอบโปรไฟล์ Roblox');
    }
  }
};
