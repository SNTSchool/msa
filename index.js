require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const { Client, GatewayIntentBits, Collection, ActivityType, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.commands = new Collection();
client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [new SpotifyPlugin()]
});

const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
let customOverride = null;
const verifyStatus = new Map();

//
// 🌐 Express API
//
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'Bot is running' }));

// ✅ verify ผ่าน API (เก็บ username + discord id)
app.post('/verify', (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) return res.status(400).json({ success: false, message: 'Missing data' });

  verifyStatus.set(userId, {
    robloxUsername: username,
    verified: true,
    enteredGame: false
  });

  console.log(`✅ Verified: ${username} (${userId})`);
  res.json({ success: true });
});

// ✅ รับข้อมูลจาก Roblox เมื่อผู้ใช้เข้าเกม
app.post('/roblox-entry', async (req, res) => {
  const { robloxUsername } = req.body;
  if (!robloxUsername) return res.status(400).json({ error: 'Missing robloxUsername' });

  const normalized = robloxUsername.trim().toLowerCase();
  const entry = [...verifyStatus.entries()].find(([_, data]) =>
    data.robloxUsername.trim().toLowerCase() === normalized &&
    data.verified && !data.enteredGame
  );

  if (!entry) return res.status(404).json({ error: 'No matching verification found' });

  const [discordUserId, data] = entry;
  data.enteredGame = true;

  try {
    await logToGoogleSheet(discordUserId, robloxUsername, 'Game Entry');
    console.log(`📋 Logged: ${robloxUsername} for Discord ID ${discordUserId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Google Sheets error:', error);
    res.status(500).json({ error: 'Failed to log to sheet' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('🚀 Express server running');
});

//
// 📋 log ลง Google Sheets (รวม logic update/append)
//
async function logToGoogleSheet(discordUserId, robloxUsername, viaMethod = 'Verified') {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const timestamp = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');

  const sheetRange = 'VerifyData!A2:G';
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetRange
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[1] === discordUserId);

  const newRow = [
    timestamp,
    discordUserId,
    '', // Roblox UserID (ยังไม่ได้ดึงจาก API)
    '', // Discord Username (ยังไม่ได้ดึงจาก Discord API)
    robloxUsername,
    'Verified',
    viaMethod
  ];

  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `VerifyData!A${rowIndex + 2}:G${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'VerifyData!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] }
    });
  }
}

//
// 🧠 โหลดคำสั่งจาก /commands + เพิ่มคำสั่ง verify/openshop/closeshop
//
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  }
}

//
// 🟣 Bot ready
//
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('ยืนยันตัวตน Roblox', { type: ActivityType.Watching });

  await registerAllCommands();
  scheduleShopStatus();
});

async function registerAllCommands() {
  const commands = [];

  for (const [name, command] of client.commands) {
    commands.push(command.data.toJSON());
  }

  commands.push(
    new SlashCommandBuilder().setName('openshop').setDescription('เปิดร้านแบบ override').toJSON(),
    new SlashCommandBuilder().setName('closeshop').setDescription('ปิดร้านแบบ override').toJSON(),
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('ยืนยันตัวตนผ่าน Roblox')
      .addStringOption(option =>
        option.setName('roblox_username')
          .setDescription('ชื่อผู้ใช้ Roblox')
          .setRequired(true))
      .toJSON()
  );

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('📦 Slash commands registered');
}

//
// 🕒 ระบบร้านค้าเปิด-ปิด auto
//
function getScheduledStatus() {
  const now = moment().tz('Asia/Bangkok');
  const day = now.day();
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

async function updateVoiceChannelStatus() {
  try {
    const status = getScheduledStatus();
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    const newName = `︰สถานะร้าน-${status === 'open' ? 'เปิด' : 'ปิด'}`;
    if (channel.name !== newName) {
      await channel.setName(newName);
      console.log(`🔄 เปลี่ยนชื่อช่องเป็น ${newName}`);
    }
  } catch (err) {
    console.error('❌ updateVoiceChannelStatus error:', err.message);
  }
}

function scheduleShopStatus() {
  cron.schedule('*/5 * * * *', updateVoiceChannelStatus);
}

//
// 🎮 Command Handler
//
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (interaction.commandName === 'openshop') {
    customOverride = 'open';
    await updateVoiceChannelStatus();
    return interaction.reply({ content: '✅ ร้านถูกเปิดแบบ override แล้ว', ephemeral: true });
  }

  if (interaction.commandName === 'closeshop') {
    customOverride = 'closed';
    await updateVoiceChannelStatus();
    return interaction.reply({ content: '✅ ร้านถูกปิดแบบ override แล้ว', ephemeral: true });
  }

  if (interaction.commandName === 'verify') {
    const robloxUsername = interaction.options.getString('roblox_username');
    verifyStatus.set(interaction.user.id, {
      robloxUsername,
      verified: true,
      enteredGame: false
    });

    await logToGoogleSheet(interaction.user.id, robloxUsername, 'Slash Command');

    return interaction.reply({
      content: `✅ ยืนยัน Roblox username: **${robloxUsername}** แล้ว! กรุณาเข้าเกมเพื่อยืนยันขั้นสุดท้าย`,
      ephemeral: true
    });
  }

  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการทำงานของคำสั่ง', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
