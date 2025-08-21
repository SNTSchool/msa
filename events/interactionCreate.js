const { ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง', ephemeral: true });
        }
      }
    }

    if (interaction.isButton() && interaction.customId === 'orderForm') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('submitOrder')
        .setTitle('ฟอร์มสั่งของ');

      const itemInput = new TextInputBuilder()
        .setCustomId('item')
        .setLabel('คุณต้องการสั่งอะไร?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const detailInput = new TextInputBuilder()
        .setCustomId('details')
        .setLabel('รายละเอียดเพิ่มเติม')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(itemInput),
        new ActionRowBuilder().addComponents(detailInput)
      );

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submitOrder') {
      const item = interaction.fields.getTextInputValue('item');
      const details = interaction.fields.getTextInputValue('details') || 'ไม่มีรายละเอียดเพิ่มเติม';
      const categoryId = process.env.ORDER_CH_ID;

      try {
        const channel = await interaction.guild.channels.create({
          name: `order-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            }
          ]
        });

        await channel.send({
          content: `🛒 <@${interaction.user.id}> ได้ทำการสั่งของ\n**รายการ:** ${item}\n**รายละเอียด:** ${details}`
        });

        await interaction.reply({ content: '✅ สร้างช่องสั่งของเรียบร้อยแล้ว!', ephemeral: true });
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ ไม่สามารถสร้างช่องได้', ephemeral: true });
      }
    }
  }
};
