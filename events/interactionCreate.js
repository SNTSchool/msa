const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { getNextTicketId, appendRow } = require('../utils/googleSheets');
const { STAFF_ROLE_IDS } = require('../config/roles');

function isStaff(member) {
  return STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function safeReply(interaction, reply) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch (err) {
    console.error('❌ Failed to reply safely:', err);
  }
}

async function safeUpdate(interaction, payload) {
  try {
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.update(payload);
    } else {
      await interaction.followUp({ ...payload, ephemeral: true });
    }
  } catch (err) {
    console.error('❌ Failed to update interaction:', err);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // 🧠 Slash Command
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

    // 🎯 Button: เปิดฟอร์มสั่งของ
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

    // 📝 Modal: สร้างช่อง order-<ticketId>
    if (interaction.isModalSubmit() && interaction.customId === 'submitOrder') {
      const item = interaction.fields.getTextInputValue('item');
      const details = interaction.fields.getTextInputValue('details') || 'ไม่มีรายละเอียดเพิ่มเติม';
      const categoryId = process.env.ORDER_CH_ID;

      try {
        const ticketId = await getNextTicketId(process.env.SPREADSHEET_ID); // returns '001'
        const ticketLabel = `Order-${ticketId}`; // for embed/footer

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

        const embed = new EmbedBuilder()
          .setTitle('📦 รายการสั่งซื้อ')
          .addFields(
            { name: 'ผู้สั่ง', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'รายการ', value: item, inline: true },
            { name: 'รายละเอียดเพิ่มเติม', value: details, inline: false }
          )
          .setColor(0x00bfff)
          .setFooter({ text: `Ticket ID: ${ticketLabel}` });

        const message = `ขอขอบพระคุณท่านที่เลือก Mydream Script Shop โปรดรอพนักงานตอบรับคำสั่งซื้อของคุณ...`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_${ticketId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: message, embeds: [embed], components: [row] });
        await safeReply(interaction, { content: '✅ สร้างช่องสั่งของเรียบร้อยแล้ว!', ephemeral: true });
      } catch (error) {
        console.error(error);
        await safeReply(interaction, { content: '❌ ไม่สามารถสร้างช่องได้', ephemeral: true });
      }
    }

    // 🎯 Button: Claim / Unclaim / Close
    if (interaction.isButton()) {
      const [action, ticketId] = interaction.customId.split('_');
      const channel = interaction.channel;

      if (action === 'claim') {
        if (!isStaff(interaction.member)) {
          return await safeReply(interaction, { content: '❌ คุณไม่มีสิทธิ์ Claim', ephemeral: true });
        }

        await channel.setName(`claimed-${ticketId}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`unclaim_${ticketId}`).setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
        );
        await safeUpdate(interaction, { components: [row] });
      }

      if (action === 'unclaim') {
        await channel.setName(`order-${ticketId}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`claim_${ticketId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
        );
        await safeUpdate(interaction, { components: [row] });
      }

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

    // 📝 Modal: เหตุผลในการปิด → log → ลบช่อง
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

        await appendRow(process.env.SPREADSHEET_ID, [
          `Order-${ticketId}`,
          interaction.user.tag,
          reason,
          transcript,
          new Date().toISOString()
        ]);

        await safeReply(interaction, { content: '✅ Ticket ถูกปิดและบันทึกเรียบร้อยแล้ว', ephemeral: true });
        await channel.delete();
      } catch (error) {
        console.error(error);
        await safeReply(interaction, { content: '❌ เกิดข้อผิดพลาดในการปิด Ticket', ephemeral: true });
      }
    }
  }
};
            
