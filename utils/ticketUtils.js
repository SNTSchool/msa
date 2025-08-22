const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getNextTicketId, appendRow } = require('../utils/googleSheets');

const claimerMap = new Map();
const ticketIdMap = new Map(); // channelId ↔ ticketId

/**
 * บันทึกผู้ที่ Claim ticket
 */
function setClaimer(channelId, userId) {
  claimerMap.set(channelId, userId);
}

/**
 * ดึงข้อมูลผู้ที่ Claim ticket
 */
function getClaimer(channelId) {
  return claimerMap.get(channelId);
}

/**
 * ล้างข้อมูล claimer ของ ticket
 */
function clearClaimer(channelId) {
  claimerMap.delete(channelId);
}

/**
 * บันทึก ticketId ที่สัมพันธ์กับ channelId
 */
function setTicketId(channelId, ticketId) {
  ticketIdMap.set(channelId, ticketId);
}

/**
 * ดึง ticketId จาก channelId
 */
function getTicketId(channelId) {
  return ticketIdMap.get(channelId);
}

/**
 * อัปเดต UI ของ ticket ตามสถานะ
 */
async function updateTicketUI(channel, status = 'open') {
  const ticketId = getTicketId(channel.id) || channel.id;

  const row = new ActionRowBuilder();

  if (status === 'open') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${ticketId}`)
        .setLabel('🎯 Claim')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`close_${ticketId}`)
        .setLabel('❌ Close')
        .setStyle(ButtonStyle.Danger)
    );
  } else if (status === 'claimed') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`unclaim_${ticketId}`)
        .setLabel('🔓 Unclaim')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`close_${ticketId}`)
        .setLabel('❌ Close')
        .setStyle(ButtonStyle.Danger)
    );
  }

  try {
    const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const lastMessage = messages?.first();

    if (lastMessage) {
      await lastMessage.edit({ components: [row] });
    } else {
      console.warn(`⚠️ ไม่พบข้อความล่าสุดในช่อง ${channel.name} (${channel.id})`);
    }
  } catch (err) {
    console.error(`❌ updateTicketUI error in ${channel.name} (${channel.id}):`, err);
  }
}

module.exports = {
  setClaimer,
  getClaimer,
  clearClaimer,
  setTicketId,
  getTicketId,
  createTicket,
  updateTicketUI
};
