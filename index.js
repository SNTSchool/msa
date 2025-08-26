require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const { 
  Client, GatewayIntentBits, Collection, ActivityType, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const fetch = require('node-fetch');

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.commands = new Collection();
client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [new SpotifyPlugin()]
});

const VOICE_CHANNEL_ID = '1407734133962309663';
let customOverride = null;
const verifyStatus = new Map();

//
// 🌐 Express API
//
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'Bot is running' }));

// ✅ รับข้อมูลจาก Roblox เมื่อผู้ใช้เข้าเกม
async function handleRobloxEntry(robloxUsername, res) {
  if (!robloxUsername) return res.status(400).json({ error: 'Missing robloxUsername' });

  const normalized = robloxUsername.trim().toLowerCase();
  const entry = [...verifyStatus.entries()].find(([_, data]) =>
    data.robloxUsername?.trim().toLowerCase() === normalized &&
    data.method === "game" &&
    data.verified && !data.enteredGame
  );

  if (!entry) return res.status(404).json({ error: 'No matching verification found' });

  const [discordUserId, data] = entry;
  data.enteredGame = true; 

  try {
    await logToGoogleSheet(discordUserId, robloxUsername, 'Game Entry');
    console.log(`📋 Logged (Game): ${robloxUsername} for Discord ID ${discordUserId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Google Sheets error:', error);
    res.status(500).json({ error: 'Failed to log to sheet' });
  }
}

app.post('/roblox-entry', (req, res) => handleRobloxEntry(req.body.robloxUsername, res));
app.get('/roblox-entry', (req, res) => handleRobloxEntry(req.query.robloxUsername, res));

app.listen(process.env.PORT || 10000, () => {
  console.log('🚀 Express server running');
});

//
// 🔑 Roblox API helper
//
async function getRobloxUserId(username) {
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: true
      })
    });
    const data = await res.json();
    if (data && data.data && data.data.length > 0) {
      return data.data[0].id.toString();
    }
    return '';
  } catch (err) {
    console.error("❌ Roblox API error:", err);
    return '';
  }
}

async function getRobloxDescription(userId) {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    const data = await res.json();
    return data.description || "";
  } catch (err) {
    console.error("❌ Roblox description fetch error:", err);
    return "";
  }
}

//
// 📊 Log ไป Google Sheets
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

  const discordUser = await client.users.fetch(discordUserId).catch(() => null);
  const discordUsername = discordUser ? discordUser.tag : 'Unknown';

  const robloxUserId = await getRobloxUserId(robloxUsername);

  const sheetRange = 'VerifyData!A2:G';
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetRange
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(row => row[2] === discordUserId);

  const newRow = [
    timestamp,
    discordUsername,
    discordUserId, 
    robloxUsername, 
    robloxUserId,
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
// 🎲 Random phrase สำหรับ description
//
function generateVerificationPhrase() {
  const subjects = ["I", "We", "They", "Someone", "A friend", "My cat"];
  const verbs = ["enjoy", "like", "love", "prefer", "sometimes eat", "dream about"];
  const objects = ["apples", "dancing in the rain", "purple cats", "flying cars", "building sandcastles", "watching the stars"];
  const extras = ["every morning", "at night", "when it rains", "on Sundays", "while coding"];

  return `${subjects[Math.floor(Math.random() * subjects.length)]} ${
    verbs[Math.floor(Math.random() * verbs.length)]
  } ${
    objects[Math.floor(Math.random() * objects.length)]
  } ${
    extras[Math.floor(Math.random() * extras.length)]
  }.`;
}

//
// 🧠 โหลด commands
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
   client.user.setActivity('ช่วยงานสุดหล่อ', {
    type: ActivityType.Streaming,
    url: 'https://www.twitch.tv/idleaccountdun'
  });
  
  await registerAllCommands();
  scheduleShopStatus();

  // ส่ง embed + ปุ่มเลือก verify
  const channel = await client.channels.fetch('1409549096385122436');
  const embed = new EmbedBuilder()
    .setTitle("🔐 เชื่อมบัญชี Roblox")
    .setDescription("เลือกวิธีการเชื่อมบัญชี Roblox และ Discord ของคุณ")
    .setColor(0x76c255);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_game")
      .setLabel("🎮 Verify via Game Entry")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("verify_description")
      .setLabel("📝 Verify via Profile Description")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
});

//
// 📋 Register commands (ลบ verify ออก)
//
async function registerAllCommands() {
  const commands = [];
  for (const [name, command] of client.commands) {
    commands.push(command.data.toJSON());
  }

  commands.push(
    new SlashCommandBuilder().setName('openshop').setDescription('เปิดร้านแบบ override').toJSON(),
    new SlashCommandBuilder().setName('closeshop').setDescription('ปิดร้านแบบ override').toJSON(),
    new SlashCommandBuilder().setName('checkdesc')
      .setDescription('ตรวจสอบการ Verify แบบ Description')
      .addStringOption(opt => opt.setName('roblox_username').setDescription('Roblox Username').setRequired(true))
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
// 🕒 ระบบร้าน auto
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
// 🎮 Interaction Handler
//
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    const discordUserId = interaction.user.id;

    if (interaction.customId === "verify_game") {
      verifyStatus.set(discordUserId, {
        method: "game",
        verified: true,
        enteredGame: false
      });

      return interaction.reply({
        content: `🎮 คุณเลือกวิธี **Verify ด้วยการเข้าเกม**\nกรุณาเข้าเกม Roblox เพื่อตรวจสอบขั้นสุดท้าย!`,
        ephemeral: true
      });
    }

    if (interaction.customId === "verify_description") {
      const phrase = generateVerificationPhrase();
      verifyStatus.set(discordUserId, {
        method: "description",
        phrase,
        verified: true,
        enteredGame: false
      });

      return interaction.reply({
        content: `📝 คุณเลือกวิธี **Verify ด้วย Profile Description**\nกรุณาแก้ Roblox **Profile Description** ของคุณเป็น:\n\`\`\`${phrase}\`\`\`\nแล้วใช้คำสั่ง /checkdesc เพื่อตรวจสอบอีกครั้ง`,
        ephemeral: true
      });
    }
  }

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

  if (interaction.commandName === 'checkdesc') {
    const robloxUsername = interaction.options.getString('roblox_username');
    const discordUserId = interaction.user.id;
    const entry = verifyStatus.get(discordUserId);

    if (!entry || entry.method !== "description") {
      return interaction.reply({ content: "❌ คุณยังไม่ได้เลือกวิธี Verify แบบ Description", ephemeral: true });
    }

    const robloxUserId = await getRobloxUserId(robloxUsername);
    if (!robloxUserId) {
      return interaction.reply({ content: "❌ ไม่พบ Roblox Username นี้", ephemeral: true });
    }

    const description = await getRobloxDescription(robloxUserId);
    if (description.includes(entry.phrase)) {
      await logToGoogleSheet(discordUserId, robloxUsername, "Description Verified");
      return interaction.reply({ content: `✅ ตรวจสอบแล้ว! คุณได้ Verify Roblox Username **${robloxUsername}** สำเร็จ`, ephemeral: true });
    } else {
      return interaction.reply({ content: "❌ Description ของคุณยังไม่ตรงกับ phrase ที่กำหนด", ephemeral: true });
    }
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
  
