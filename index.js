require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ActivityType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const VOICE_CHANNEL_ID = '1407734133962309663';
let customOverride = null;

// โหลดคำสั่งจาก ./commands
const commandFiles = fs.readdirSync('./commands');
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// โหลด events จาก ./events
const eventFiles = fs.readdirSync('./events');
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Express server สำหรับ Render
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(process.env.PORT || 10000, () => {
  console.log('Web service is running');
});

// 🟣 ตั้งสถานะ Streaming และเริ่ม cron job
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('ช่วยงานสุดหล่อ', {
    type: ActivityType.Streaming,
    url: 'http://discord.gg/AExMrh4Ddb'
  });

  await registerShopCommands();
  scheduleShopStatus();
});

// 🛠️ ลงทะเบียนคำสั่ง /openshop และ /closeshop
async function registerShopCommands() {
  const commands = [
    new SlashCommandBuilder().setName('openshop').setDescription('เปิดร้านแบบ override'),
    new SlashCommandBuilder().setName('closeshop').setDescription('ปิดร้านแบบ override')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log('✅ Registered shop status commands');
}

// 🕒 ตรวจสอบสถานะร้านตามเวลา GMT+7
function getScheduledStatus() {
  const now = moment().tz('Asia/Bangkok');
  const day = now.day(); // 0 = Sunday
  const hour = now.hour();
  const minute = now.minute();
  const time = hour + minute / 60;

  if (customOverride) return customOverride;

  if (day >= 1 && day <= 5) {
    return time >= 17 && time < 21 ? 'open' : 'closed';
  } else if (day === 6) {
    return time >= 13 && time < 20 ? 'open' : 'closed';
  } else if (day === 0) {
    return time >= 8.5 && time < 20 ? 'open' : 'closed';
  }
  return 'closed';
}

// 🔁 เปลี่ยนชื่อช่องเสียงตามสถานะ
async function updateVoiceChannelStatus() {
  const status = getScheduledStatus();
  const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
  if (!channel) return;

  const newName = `︰สถานะร้าน-${status === 'open' ? 'เปิด' : 'ปิด'}`;
  if (channel.name !== newName) {
    await channel.setName(newName);
    console.log(`🔄 เปลี่ยนชื่อช่องเป็น ${newName}`);
  }
}

// ⏱️ ตั้ง cron job ทุก 5 นาที
function scheduleShopStatus() {
  cron.schedule('*/5 * * * *', updateVoiceChannelStatus);
}

// 🧠 จัดการคำสั่ง override
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'openshop') {
    customOverride = 'open';
    await updateVoiceChannelStatus();
    await interaction.reply({ content: '✅ ร้านถูกเปิดแบบ override แล้ว', ephemeral: true });
  }

  if (interaction.commandName === 'closeshop') {
    customOverride = 'closed';
    await updateVoiceChannelStatus();
    await interaction.reply({ content: '✅ ร้านถูกปิดแบบ override แล้ว', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
