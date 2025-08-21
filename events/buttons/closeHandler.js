const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

async function handleCloseButton(interaction) {
  const ticketId = interaction.customId.split('_')[1];

  const modal = new ModalBuilder()
    .setCustomId(`confirmClose_${ticketId}`)
    .setTitle('เหตุผลในการปิด Ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('กรุณาระบุเหตุผล')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

  await interaction.showModal(modal);
}

module.exports = handleCloseButton;
