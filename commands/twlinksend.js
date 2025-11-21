// ./commands/twlinksend.js
const { SlashCommandBuilder } = require('discord.js');
const { ADMIN_IDS, ANNOUNCE_CHANNEL_ID } = require('../config/twconfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('twlinksend')
    .setDescription('สร้าง embed แจ้งรับเติมเงิน (Admin only)')
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('User ที่จะให้ส่งลิงก์ไปหา (target)')
      .setRequired(true))
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('ช่องที่จะส่ง embed (ไม่ใส่=ช่องที่ใช้คำสั่ง)')),

  async execute(interaction) {
    // สิทธิ์
    if (!ADMIN_IDS.includes(interaction.user.id)) {
      return interaction.reply({ content: 'คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const optChannel = interaction.options.getChannel('channel');
    // ถ้าไม่ใส่ channel ให้ส่งที่ช่องที่ใช้คำสั่ง
    const sendChannel = optChannel || interaction.channel;

    if (!sendChannel || !sendChannel.isTextBased()) {
      return interaction.reply({ content: 'ไม่พบช่องสำหรับส่ง embed', ephemeral: true });
    }

    // สร้าง embed และปุ่ม
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const embed = new EmbedBuilder()
      .setTitle('🔔 ขอเติมเงิน (TrueMoney)')
      .setDescription(`ผู้ใช้เป้าหมาย: <@${target.id}>\nกรุณากดปุ่ม **เติมเงิน** เพื่อเปิดฟอร์มส่งลิงก์อั่งเปาและหมายเหตุ`)
      .setColor(0x00AE86)
      .setTimestamp();

    // สร้างปุ่มชั่วคราว (จะอัปเดต customId หลังส่ง)
    const tmpCustomId = `twbtn_temp_${target.id}_${Date.now()}`;

    const button = new ButtonBuilder()
      .setCustomId(tmpCustomId)
      .setLabel('เติมเงิน')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    // ต้อง ack interaction (ใช้ ephemeral reply) เพื่อหลีกเลี่ยง "This interaction failed"
    await interaction.deferReply({ ephemeral: true });

    // ส่ง embed เป็น message แยก (ไม่ใช่ reply)
    const sentMsg = await sendChannel.send({ embeds: [embed], components: [row] });

    // อัปเดตปุ่มให้มี messageId ใน customId เพื่อนำไปใช้งานต่อ
    const newCustomId = `twbtn_${target.id}_${sendChannel.id}_${sentMsg.id}`;
    const newButton = new ButtonBuilder()
      .setCustomId(newCustomId)
      .setLabel('เติมเงิน')
      .setStyle(ButtonStyle.Success);
    const newRow = new ActionRowBuilder().addComponents(newButton);

    await sentMsg.edit({ components: [newRow] });

    // ตอบกลับเฉพาะผู้เรียกคำสั่งแบบ ephemeral ว่าเรียบร้อย (ไม่เป็นข้อความสาธารณะ)
    await interaction.editReply({ content: `ส่ง embed ไปที่ <#${sendChannel.id}> เรียบร้อย`, ephemeral: true });
  }
};
