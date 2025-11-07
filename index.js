// index.js - combined, updated
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const crypto = require('crypto');

// fetch compatibility: use global fetch if available, otherwise try node-fetch (v2 or v3)
let fetcher;
if (typeof fetch !== 'undefined') fetcher = fetch;
else {
  try {
    // try require (node-fetch v2)
    fetcher = require('node-fetch');
  } catch (err) {
    // dynamic import (node-fetch v3)
    fetcher = (...args) => import('node-fetch').then(m => m.default(...args));
  }
}

const {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');

const app = express();
app.use(express.json());

/* ---------------- Config & Globals ---------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID || '';
const VERIFY_PANEL_CHANNEL_ID = process.env.VERIFY_PANEL_CHANNEL_ID || '';
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID || '';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '';
const TICKET_LOG_CHANNEL = process.env.TICKET_LOG_CHANNEL || '';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_NAME_TRANSCRIPT = 'Transcript';
const SHEET_NAME_VERIFY = 'VerifyData';
const BASE_URL = process.env.BASE_URL || ''; // e.g. https://your-app.onrender.com
const PORT = process.env.PORT || 10000;
const CLAIM_COOLDOWN_MS = 10 * 60 * 1000;

const verifyStatus = new Map(); // discordUserId -> { method, robloxUsername, phrase, verified, enteredGame }
const pkceStore = {}; // state -> { verifier, createdAt, discordId? }
const orderTypeStore = new Map();
const ticketStore = new Map();
const lastClaimAt = new Map();

/* ---------------- Google Sheets helper ---------------- */
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function appendVerifyRow(discordUserId, robloxUsername, viaMethod = 'Verified') {
  try {
    const sheets = await getSheetsClient();
    const timestamp = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
    let discordUsername = 'WEB-OAUTH';
    if (discordUserId) {
      try {
        const u = await client.users.fetch(discordUserId).catch(()=>null);
        if (u) discordUsername = u.tag;
        else discordUsername = discordUserId;
      } catch (e) {
        discordUsername = discordUserId;
      }
    }
    const robloxUserId = await getRobloxUserId(robloxUsername);
    const row = [timestamp, discordUsername, discordUserId || '', robloxUsername, robloxUserId, 'Verified', viaMethod];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_VERIFY}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch (err) {
    console.error('appendVerifyRow error', err);
  }
}

async function getRobloxUserId(username) {
  try {
    const res = await fetcher('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const data = await res.json();
    if (data && data.data && data.data.length > 0) return data.data[0].id.toString();
    return '';
  } catch (err) {
    console.error('getRobloxUserId error', err);
    return '';
  }
}

/* ---------------- PKCE helpers ---------------- */
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function genPkce() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/* expose to other modules if needed */
global.verifyStatus = verifyStatus;
global.appendVerifyRow = appendVerifyRow;

/* ---------------- Dynamic command registration ---------------- */
async function registerApplicationCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const commandsDir = path.join(__dirname, 'commands');
    const files = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir).filter(f => f.endsWith('.js')) : [];
    const payload = [];
    for (const f of files) {
      try {
        const cmd = require(path.join(commandsDir, f));
        if (cmd && cmd.data) payload.push(cmd.data.toJSON ? cmd.data.toJSON() : cmd.data);
      } catch (e) {
        console.warn('cmd load fail', f, e);
      }
    }
    if (payload.length === 0) return;
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: payload });
      console.log('Registered guild commands:', payload.map(c=>c.name));
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: payload });
      console.log('Registered global commands:', payload.map(c=>c.name));
    }
  } catch (err) {
    console.error('registerApplicationCommands error', err);
  }
}

/* ---------------- Page CSS ---------------- */
const PAGE_CSS = `
<style>
:root{--accent1:#7c5cff;--accent2:#5ad0ff;--muted:#6b7280}
body{font-family:Inter,system-ui,Segoe UI,Roboto,Arial; background:linear-gradient(180deg,#f8fafc,#eef2ff); margin:0; padding:28px; color:#0f172a}
.container{max-width:780px;margin:24px auto;background:#fff;border-radius:12px;padding:26px;box-shadow:0 10px 30px rgba(15,23,42,0.06)}
h1{margin:0 0 8px;font-size:20px}
p{color:var(--muted);line-height:1.5}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600;cursor:pointer;border:none}
.btn-primary{background:linear-gradient(180deg,var(--accent1),var(--accent2));color:#fff;box-shadow:0 10px 25px rgba(92,59,255,0.12)}
.btn-ghost{background:transparent;color:var(--accent1);border:1px solid rgba(124,92,255,0.12);padding:8px 14px;border-radius:10px}
.small{font-size:13px;color:var(--muted);margin-top:12px}
</style>
`;

/* ---------------- Routes: login, callback, privacy, terms ---------------- */

/**
 * GET /login
 * Accepts optional ?discordId= to associate OAuth flow with a Discord user.
 * Stores PKCE verifier in pkceStore[state] along with discordId.
 */
app.get('/login', (req, res) => {
  const { verifier, challenge } = genPkce();
  const state = base64url(crypto.randomBytes(24));
  pkceStore[state] = { verifier, createdAt: Date.now(), discordId: req.query.discordId || null };
  const authorizeUrl = new URL('https://apis.roblox.com/oauth/v1/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', process.env.ROBLOX_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', process.env.ROBLOX_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  const authUrlStr = authorizeUrl.toString();

  return res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Login with Roblox</title>${PAGE_CSS}</head>
      <body>
        <div class="container">
          <h1>Login with Roblox</h1>
          <p>Click the button to open Roblox OAuth. After authorizing, you'll be returned here.</p>
          <div class="actions">
            <a class="btn btn-primary" href="${authUrlStr}">🔗 Login with Roblox</a>
            <a class="btn btn-ghost" href="/privacy-policy">Privacy Policy</a>
            <a class="btn btn-ghost" href="/terms-of-service">Terms of Service</a>
          </div>
          <div class="small">If you opened this from Discord, consider using the "Verify via OAuth" button in the Verify panel to include your Discord ID automatically.</div>
        </div>
      </body>
    </html>
  `);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code/state');
  const store = pkceStore[state];
  if (!store) return res.status(400).send('Invalid or expired state');
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ROBLOX_CLIENT_ID,
      client_secret: process.env.ROBLOX_CLIENT_SECRET || '',
      redirect_uri: process.env.ROBLOX_REDIRECT_URI,
      code: String(code),
      code_verifier: store.verifier
    });
    const tokenResp = await fetcher('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      console.error('Token exchange failed:', txt);
      return res.status(500).send('Token exchange failed');
    }
    const tokens = await tokenResp.json();
    delete pkceStore[state];

    // fetch userinfo
    const accessToken = tokens.access_token;
    const userinfoResp = await fetcher('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!userinfoResp.ok) {
      const txt = await userinfoResp.text();
      console.error('userinfo failed:', txt);
      return res.status(500).send('Failed to fetch userinfo');
    }
    const userinfo = await userinfoResp.json();
    const robloxId = userinfo.sub || userinfo.id || userinfo.user_id || '';
    const robloxName = userinfo.preferred_username || userinfo.username || userinfo.display_name || '';

    // Append to sheet with discord info if available in state
    try {
      const discordId = store.discordId || '';
      await appendVerifyRow(discordId, robloxName, 'OAuth');
      // DM the user if discordId present
      if (discordId) {
        try {
          const u = await client.users.fetch(discordId).catch(()=>null);
          if (u) await u.send(`✅ Roblox verification completed for ${robloxName}`);
        } catch (e) { /* ignore DM errors */ }
      }
    } catch (err) {
      console.warn('appendVerifyRow failed', err);
    }

    // render success page
    return res.send(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>Verification complete</title>${PAGE_CSS}</head>
        <body>
          <div class="container">
            <h1>Verification complete ✅</h1>
            <p>Roblox username: <strong>${robloxName}</strong></p>
            <p>Roblox id: <strong>${robloxId}</strong></p>
            <div class="actions">
              <a class="btn btn-primary" href="/">Go Home</a>
              <a class="btn btn-ghost" href="/privacy-policy">Privacy Policy</a>
              <a class="btn btn-ghost" href="/terms-of-service">Terms of Service</a>
            </div>
            <div class="small">This page may be closed.</div>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth callback error', err);
    return res.status(500).send('OAuth failed');
  }
});

/* Privacy & Terms pages */
app.get('/privacy-policy', (req, res) => {
  return res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Privacy Policy</title>${PAGE_CSS}</head>
      <body>
        <div class="container">
          <h1>Privacy Policy</h1>
          <p>We store Discord ID, Discord username (if provided), Roblox username and verification status to manage server verification and tickets. Data is stored in a Google Sheet accessible by server admins.</p>
          <h3>Contact</h3>
          <p>If you want your data removed, contact server admins.</p>
          <div class="actions">
            <a class="btn btn-ghost" href="/">Back</a>
            <a class="btn btn-ghost" href="/terms-of-service">Terms</a>
          </div>
          <div class="small">Updated: ${new Date().toISOString().slice(0,10)}</div>
        </div>
      </body>
    </html>
  `);
});

app.get('/terms-of-service', (req, res) => {
  return res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Terms of Service</title>${PAGE_CSS}</head>
      <body>
        <div class="container">
          <h1>Terms of Service</h1>
          <ol>
            <li>Do not use the bot for activities that violate Roblox or Discord rules.</li>
            <li>Provide accurate information when verifying.</li>
            <li>Admins may remove erroneous or malicious entries.</li>
          </ol>
          <div class="actions">
            <a class="btn btn-ghost" href="/">Back</a>
            <a class="btn btn-ghost" href="/privacy-policy">Privacy</a>
          </div>
          <div class="small">Updated: ${new Date().toISOString().slice(0,10)}</div>
        </div>
      </body>
    </html>
  `);
});

/* In-game entry endpoints */
app.get('/roblox-entry', (req, res) => res.json({ message: '{ robloxUsername }' }));
app.post('/roblox-entry', async (req, res) => {
  try {
    const { robloxUsername } = req.body;
    if (!robloxUsername) return res.status(400).json({ error: 'Missing robloxUsername' });
    const normalized = robloxUsername.trim().toLowerCase();
    const entry = [...verifyStatus.entries()].find(([_, data]) =>
      data.robloxUsername?.trim().toLowerCase() === normalized && data.verified && !data.enteredGame
    );
    if (!entry) return res.status(404).json({ error: 'No matching verification found' });
    const [discordUserId, data] = entry;
    data.enteredGame = true;
    await appendVerifyRow(discordUserId, robloxUsername, 'Game Entry');
    return res.json({ success: true });
  } catch (err) {
    console.error('roblox-entry handler error', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

/* health */
app.get('/.well-known/health', (req, res) => res.status(200).send('OK'));

/* Discord ready & panels */
client.once('ready', async () => {
  console.log('Discord ready:', client.user.tag);

  // load commands from ./commands into memory
  try {
    const commandsDir = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsDir)) {
      const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
      for (const f of files) {
        try {
          const cmd = require(path.join(commandsDir, f));
          if (cmd && cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
        } catch (e) { console.warn('load cmd fail', f, e); }
      }
    }
  } catch (e) { console.warn('load commands error', e); }

  // register app commands via REST
  await registerApplicationCommands();

  // send verify panel to channel (with a button that creates an ephemeral per-user login link)
  if (VERIFY_PANEL_CHANNEL_ID) {
    try {
      const ch = await client.channels.fetch(VERIFY_PANEL_CHANNEL_ID).catch(()=>null);
      if (ch) {
        const embed = new EmbedBuilder().setTitle('🔑 Roblox Verification').setDescription('เลือกวิธีการยืนยันบัญชี Roblox ของคุณ').setColor(0x76c255);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_game_modal_btn').setLabel('🎮 Verify via Game').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('verify_desc_modal_btn').setLabel('📝 Verify via Description').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('verify_oauth_request').setLabel('🔗 Verify via OAuth (get link)').setStyle(ButtonStyle.Secondary)
        );
        await ch.send({ embeds: [embed], components: [row] });
      }
    } catch (e) { console.error('send verify panel failed', e); }
  }
});

/* Interaction handling */
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) {
        try { await cmd.execute(interaction, client); } catch (e) { console.error('cmd exec fail', e); await interaction.reply({ content: 'Command error', ephemeral: true }); }
      }
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id === 'verify_oauth_request') {
        // create ephemeral per-user link containing discordId
        const base = (BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
        const url = base + '/login?discordId=' + encodeURIComponent(interaction.user.id);
        return interaction.reply({ content: `🔗 Click to login: ${url}`, ephemeral: true });
      }
      if (id === 'verify_game_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_game_modal').setTitle('Verify via Game');
        const input = new TextInputBuilder().setCustomId('vg_username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (id === 'verify_desc_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_desc_modal').setTitle('Verify via Description');
        const input = new TextInputBuilder().setCustomId('vd_username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_desc_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vd_username');
        const phrase = (function generateVerificationPhrase(){
          const subjects = ["I","We","They","Someone","A friend","My cat"];
          const verbs = ["enjoy","like","love","prefer","sometimes eat","dream about"];
          const objects = ["apples","dancing in the rain","purple cats","flying cars","building sandcastles","watching the stars"];
          const extras = ["every morning","at night","when it rains","on Sundays","while coding"];
          return `${subjects[Math.floor(Math.random()*subjects.length)]} ${verbs[Math.floor(Math.random()*verbs.length)]} ${objects[Math.floor(Math.random()*objects.length)]} ${extras[Math.floor(Math.random()*extras.length)]}.`;
        })();
        verifyStatus.set(interaction.user.id, { method: 'description', robloxUsername, phrase, verified: true, enteredGame: false });
        return interaction.reply({ content: `📝 โปรดตั้ง Profile Description ของคุณเป็น:\n\`\`\`${phrase}\`\`\`\nแล้วใช้คำสั่ง /verify-desc เพื่อยืนยัน`, ephemeral: true });
      }
      if (interaction.customId === 'verify_game_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vg_username');
        verifyStatus.set(interaction.user.id, { method: 'game', robloxUsername, verified: true, enteredGame: false });
        return interaction.reply({ content: `🎮 โปรดเข้าเกมเพื่อยืนยัน: ${robloxUsername}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error('interactionCreate error', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); } catch {}
  }
});

/* Utilities */
async function collectTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const arr = Array.from(messages.values()).reverse();
    return arr.map(m => `[${moment(m.createdAt).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm')}] ${m.author.tag}: ${m.content}`).join('\\n');
  } catch (err) {
    console.error('collectTranscript error', err);
    return '';
  }
}

/* voice channel status update */
let customOverride = null;
function getScheduledStatus() {
  const now = moment().tz('Asia/Bangkok');
  const day = now.day();
  const time = now.hour() + now.minute() / 60;
  if (customOverride) return customOverride;
  if (day >= 1 && day <= 5) return time >= 17 && time < 21 ? 'open' : 'closed';
  if (day === 6) return time >= 13 && time < 20 ? 'open' : 'closed';
  if (day === 0) return time >= 8.5 && time < 20 ? 'open' : 'closed';
  return 'closed';
}
async function updateVoiceChannelStatus() {
  try {
    if (!VOICE_CHANNEL_ID) return;
    const ch = await client.channels.fetch(VOICE_CHANNEL_ID).catch(()=>null);
    if (!ch) return;
    const status = getScheduledStatus();
    const newName = `︰สถานะร้าน-${status === 'open' ? 'เปิด' : 'ปิด'}`;
    if (ch.name !== newName) await ch.setName(newName);
  } catch (err) { console.error('updateVoiceChannelStatus', err); }
}

/* Start express and load commands then login */
app.listen(PORT, () => console.log(`Express running on ${PORT}`));

try {
  const commandsDir = path.join(__dirname, 'commands');
  if (fs.existsSync(commandsDir)) {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    for (const f of files) {
      try {
        const cmd = require(path.join(commandsDir, f));
        if (cmd && cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
      } catch (e) { console.warn('load cmd fail', f, e); }
    }
  }
} catch (e) { console.warn('load commands error', e); }

client.login(process.env.TOKEN).then(()=> console.log('Discord client logged in')).catch(err => console.error('login error', err));
