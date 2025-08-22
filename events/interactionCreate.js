const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const { createTicket } = require('../handlers/createTicket');
const { closeTicket } = require('../handlers/closeTicket');
const { handleClaim, handleUnclaim } = require('../handlers/claimHandler');
const { STAFF_ROLE_IDS } = require('../config/roles');
const { safeReply } = require('../utils/safeInteraction');
const { setTicketId } = require('../utils/ticketUtils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(error);
        await safeReply(interaction, { content: '❌ เกิดข้อผิดพลาดในการรันคำสั่ง', ephemeral: true });
      }
    }

    if (interaction.isButton() && interaction.customId === 'orderForm') {
      const modal = new ModalBuilder()
        .setCustomId('submitOrder')
        .setTitle('ฟอร์มสั่งของ')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('item')
              .setLabel('คุณต้องการสั่งอะไร?')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('details')
              .setLabel('รายละเอียดเพิ่มเติม')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submitOrder') {
      const item = interaction.fields.getTextInputValue('item');
      const details = interaction.fields.getTextInputValue('details') || 'ไม่มีรายละเอียดเพิ่มเติม';

      try {
        const ticketId = await createTicket(interaction, item, details);
        const categoryId = process.env.ORDER_CH_ID;
        
        const channel = await interaction.guild.channels.create({
          name: `order-${ticketId}`,
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

          setTicketId(channel.id, ticketId);

        
        const embed = new EmbedBuilder()
          .setTitle('📦 รายการสั่งซื้อ')
          .addFields(
            { name: 'ผู้สั่ง', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'รายการ', value: item, inline: true },
            { name: 'รายละเอียดเพิ่มเติม', value: details, inline: false }
          )
          .setColor(0x00bfff)
          .setFooter({ text: `Ticket ID: Order-${ticketId}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_${ticketId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await safeReply(interaction, { content: '✅ สร้างช่องสั่งของเรียบร้อยแล้ว!', ephemeral: true });
      } catch (error) {
        console.error(error);
        await safeReply(interaction, { content: '❌ ไม่สามารถสร้าง Ticket ได้', ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      const [action, ticketId] = interaction.customId.split('_');
      
      if (action === 'claim') return await handleClaim(interaction, ticketId);
      if (action === 'unclaim') return await handleUnclaim(interaction, ticketId);

      if (action === 'close') {
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
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('confirmClose_')) {
      const ticketId = interaction.customId.split('_')[1];
      const reason = interaction.fields.getTextInputValue('reason');
      const channel = interaction.channel;

      try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = messages
          .filter(m => !m.author.bot)
          .map(m => `${m.author.tag}: ${m.content}`)
          .reverse()
          .join('\n');

        await closeTicket(ticketId, reason, transcript);
        await safeReply(interaction, { content: '✅ Ticket ถูกปิดและบันทึกเรียบร้อยแล้ว', ephemeral: true });
        await channel.delete();
      } catch (error) {
        console.error(error);
        await safeReply(interaction, { content: '❌ เกิดข้อผิดพลาดในการปิด Ticket', ephemeral: true });
      }
    }
  }
};
                                                       
