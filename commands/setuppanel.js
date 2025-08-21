const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setuppanel')
    .setDescription('สร้าง Ticket Panel'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🎫 สร้าง Ticket')
      .setDescription('เลือกหมวดหมู่ที่คุณต้องการสอบถาม')
      .setColor(0x00AE86);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('orderForm').setLabel('📦 Order | สั่งของ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_report').setLabel('🚨 Report').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_other').setLabel('📦 Other').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
};
