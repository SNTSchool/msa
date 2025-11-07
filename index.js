// index.js - optimized startup to avoid host timeouts
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const crypto = require('crypto');

// fetcher: use global fetch if available, else dynamic import node-fetch
let fetcher;
if (typeof fetch !== 'undefined') fetcher = fetch;
else fetcher = (...args) => import('node-fetch').then(m => m.default(...args));

const {
  Client,
  GatewayIntentBits,
  Collection,
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
  StringSelectMenuBuilder,
  ActivityType
} = require('discord.js');

const app = express();
app.use(express.json());

/* -------- Config -------- */
const PORT = process.env.PORT || 10000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/,'');
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEET_NAME_VERIFY = 'VerifyData';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});
client.commands = new Collection();

/* In-memory stores */
const verifyStatus = new Map(); // discordId -> { method, robloxUsername, phrase, verified, enteredGame, createdAt, expiryTimeout }
const pkceStore = {}; // state -> { verifier, createdAt, discordId }

/* Helpers */
function base64url(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return Buffer.from(String(buf)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function genPkce() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/* Lightweight Google Sheets client factory (created on-demand) */
async function getSheetsClient() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID not set');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const clientAuth = await auth.getClient();
  return google.sheets({ version: 'v4', auth: clientAuth });
}

async function appendVerifyRow(discordUserId, robloxUsername, viaMethod='OAuth') {
  try {
    const sheets = await getSheetsClient();
    const timestamp = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
    let discordTag = discordUserId || 'WEB-OAUTH';
    try {
      if (discordUserId) {
        const u = await client.users.fetch(discordUserId).catch(()=>null);
        if (u) discordTag = u.tag;
      }
    } catch {}
    const robloxUserId = await (async function getRobloxUserId(username){
      try {
        const r = await fetcher('https://users.roblox.com/v1/usernames/users', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usernames:[username], excludeBannedUsers:true})
        });
        const d = await r.json();
        if (d && d.data && d.data.length>0) return d.data[0].id.toString();
        return '';
      } catch(e){ return ''; }
    })(robloxUsername);
    const row = [timestamp, discordTag, discordUserId || '', robloxUsername, robloxUserId, 'Verified', viaMethod];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_VERIFY}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch (err) {
    console.error('appendVerifyRow error', err.message || err);
  }
}

/* Schedule expiry for game verify entries (10 minutes default) */
function scheduleGameExpiry(discordId, minutes=10) {
  const entry = verifyStatus.get(discordId);
  if (!entry) return;
  if (entry.expiryTimeout) clearTimeout(entry.expiryTimeout);
  entry.expiryTimeout = setTimeout(() => {
    const cur = verifyStatus.get(discordId);
    if (cur && !cur.enteredGame) {
      verifyStatus.delete(discordId);
      console.log(`Expired verify entry for ${discordId}`);
    }
  }, minutes * 60 * 1000);
  verifyStatus.set(discordId, entry);
}

/* ---- Routes: discord oauth, roblox oauth, callback ---- */

/* Discord OAuth: redirect user to Discord oauth (identify) */
app.get('/discord-login', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirect) return res.status(500).send('Discord OAuth not configured');
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  return res.redirect(url.toString());
});

/* Discord callback: exchange code, fetch user, redirect to /login?discordId=... */
app.get('/discord-callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');
    const params = new URLSearchParams();
    params.set('client_id', process.env.DISCORD_CLIENT_ID);
    params.set('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', process.env.DISCORD_REDIRECT_URI);
    const tokenResp = await fetcher('https://discord.com/api/oauth2/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: params });
    const token = await tokenResp.json();
    const userResp = await fetcher('https://discord.com/api/users/@me', { headers:{ Authorization: `Bearer ${token.access_token}` } });
    const user = await userResp.json();
    const discordId = user && user.id ? user.id : null;
    if (!discordId) return res.status(500).send('Failed to get Discord id');
    return res.redirect(`${BASE_URL}/login?discordId=${encodeURIComponent(discordId)}`);
  } catch (err) {
    console.error('discord-callback error', err.message || err);
    return res.status(500).send('Discord callback failed');
  }
});

/* Login: requires discordId (redirect to /discord-login if missing) */
app.get('/login', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.redirect('/discord-login');
  const { verifier, challenge } = genPkce();
  const state = base64url(crypto.randomBytes(24));
  pkceStore[state] = { verifier, createdAt: Date.now(), discordId };
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id', process.env.ROBLOX_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.ROBLOX_REDIRECT_URI);
  url.searchParams.set('scope','openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method','S256');
  const authUrl = url.toString();
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Login Roblox</title></head><body>
    <h2>Login with Roblox</h2>
    <p>Discord ID: ${discordId}</p>
    <a href="${authUrl}">Login with Roblox</a>
  </body></html>`);
});

/* Roblox callback: exchange code, get userinfo, store verification + append to sheet */
app.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const store = pkceStore[state];
    if (!store) return res.status(400).send('Invalid state');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ROBLOX_CLIENT_ID,
      client_secret: process.env.ROBLOX_CLIENT_SECRET || '',
      redirect_uri: process.env.ROBLOX_REDIRECT_URI,
      code: String(code),
      code_verifier: store.verifier
    });
    const tokenResp = await fetcher('https://apis.roblox.com/oauth/v1/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      console.error('roblox token failed', t);
      return res.status(500).send('Token exchange failed');
    }
    const tokens = await tokenResp.json();
    delete pkceStore[state];
    const userinfoResp = await fetcher('https://apis.roblox.com/oauth/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const userinfo = await userinfoResp.json();
    const robloxName = userinfo.preferred_username || userinfo.username || userinfo.display_name || '';
    const discordId = store.discordId || '';
    // store verify entry and immediately append to sheet
    verifyStatus.set(discordId, { method:'oauth', robloxUsername: robloxName, verified: true, enteredGame: false, createdAt: Date.now() });
    try { await appendVerifyRow(discordId, robloxName, 'OAuth'); } catch(e){ console.warn('append failed', e); }
    return res.send(`<html><body><h2>Verified</h2><p>Roblox: ${robloxName}</p><p>Discord: ${discordId}</p></body></html>`);
  } catch (err) {
    console.error('callback error', err.message || err);
    return res.status(500).send('OAuth callback failed');
  }
});

/* Game verify endpoints for Roblox server */
app.get('/game-verify', (req, res) => {
  const robloxUsername = req.query.robloxUsername;
  if (!robloxUsername) return res.status(400).json({ error: 'Missing robloxUsername' });
  const normalized = robloxUsername.trim().toLowerCase();
  const candidates = [];
  for (const [discordId, data] of verifyStatus.entries()) {
    if (data.robloxUsername && data.robloxUsername.trim().toLowerCase() === normalized && data.verified && !data.enteredGame) {
      candidates.push({ discordId, method: data.method, createdAt: data.createdAt || null });
    }
  }
  return res.json({ candidates });
});

app.post('/game-verify/accept', async (req, res) => {
  try {
    const { discordId, robloxUsername } = req.body;
    if (!discordId || !robloxUsername) return res.status(400).json({ error: 'Missing fields' });
    const entry = verifyStatus.get(discordId);
    if (!entry || entry.robloxUsername?.trim().toLowerCase() !== robloxUsername.trim().toLowerCase()) return res.status(404).json({ error: 'Not found' });
    entry.enteredGame = true;
    verifyStatus.set(discordId, entry);
    await appendVerifyRow(discordId, robloxUsername, 'Game-Accepted');
    return res.json({ success: true });
  } catch (err) {
    console.error('accept error', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

app.post('/game-verify/reject', (req, res) => {
  try {
    const { discordId } = req.body;
    if (!discordId) return res.status(400).json({ error: 'Missing discordId' });
    verifyStatus.delete(discordId);
    return res.json({ success: true });
  } catch (err) {
    console.error('reject error', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

/* Minimal privacy/terms pages for user display */
const PAGE_CSS = `<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}a{color:blue}</style>`;
app.get('/privacy-policy', (req, res) => res.send(`<!doctype html><html><head>${PAGE_CSS}</head><body><h1>Privacy</h1><p>We store Discord ID and Roblox username in a Google Sheet.</p></body></html>`));
app.get('/terms-of-service', (req, res) => res.send(`<!doctype html><html><head>${PAGE_CSS}</head><body><h1>Terms</h1><p>Use responsibly.</p></body></html>`));

/* Health */
app.get('/.well-known/health', (req, res) => res.status(200).send('OK'));

/* Start Express first (fast) */
app.listen(PORT, () => console.log(`Express listening on ${PORT}`));

/* Load commands lazily and register after ready */
async function loadCommandsAndRegister() {
  try {
    const commandsDir = path.join(__dirname, 'commands');
    const payload = [];
    if (fs.existsSync(commandsDir)) {
      const files = fs.readdirSync(commandsDir).filter(f=>f.endsWith('.js'));
      for (const f of files) {
        try {
          const cmd = require(path.join(commandsDir, f));
          if (cmd && cmd.data && cmd.execute) {
            client.commands.set(cmd.data.name, cmd);
            payload.push(cmd.data.toJSON ? cmd.data.toJSON() : cmd.data);
          }
        } catch (e) { console.warn('cmd load fail', f, e.message || e); }
      }
    }
    if (payload.length && process.env.CLIENT_ID) {
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      if (process.env.GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: payload });
        console.log('Registered guild commands');
      } else {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: payload });
        console.log('Registered global commands');
      }
    }
  } catch (err) { console.error('loadCommandsAndRegister error', err.message || err); }
}

client.once('ready', async () => {
  console.log('Discord ready', client.user.tag);
  loadCommandsAndRegister().catch(e=>console.warn('register fail', e.message || e));
  (async function sendPanel(){
    try {
      const chId = process.env.VERIFY_PANEL_CHANNEL_ID;
      if (!chId) return;
      const ch = await client.channels.fetch(chId).catch(()=>null);
      if (!ch) return;
      const embed = new EmbedBuilder().setTitle('🔑 Roblox Verification').setDescription('Choose verification method').setColor(0x76c255);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_game_modal_btn').setLabel('🎮 Verify via Game').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('verify_desc_modal_btn').setLabel('📝 Verify via Description').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('verify_oauth_request').setLabel('🔗 Get OAuth Link').setStyle(ButtonStyle.Secondary)
      );
      await ch.send({ embeds: [embed], components: [row] });
    } catch (e) { console.warn('sendPanel failed', e.message || e); }
  })();
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'verify_oauth_request') {
        const url = `${BASE_URL}/login?discordId=${encodeURIComponent(interaction.user.id)}`;
        return interaction.reply({ content: `🔗 ${url}`, ephemeral: true });
      }
      if (interaction.customId === 'verify_game_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_game_modal').setTitle('Verify via Game');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vg_username').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }
      if (interaction.customId === 'verify_desc_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_desc_modal').setTitle('Verify via Description');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vd_username').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_game_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vg_username');
        verifyStatus.set(interaction.user.id, { method:'game', robloxUsername, verified:true, enteredGame:false, createdAt: Date.now() });
        scheduleGameExpiry(interaction.user.id, 10);
        return interaction.reply({ content: `🎮 Please enter the game within 10 minutes: ${robloxUsername}`, ephemeral: true });
      }
      if (interaction.customId === 'verify_desc_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vd_username');
        const phrase = (function(){ const s=["I","We","They"]; const v=["enjoy","like","love"]; const o=["apples","coding"]; return `${s[Math.floor(Math.random()*s.length)]} ${v[Math.floor(Math.random()*v.length)]} ${o[Math.floor(Math.random()*o.length)]}.`; })();
        verifyStatus.set(interaction.user.id, { method:'description', robloxUsername, phrase, verified:true, enteredGame:false, createdAt: Date.now() });
        return interaction.reply({ content: `📝 Set your Roblox profile description to:\n\`\`\`${phrase}\`\`\` then use /verify-desc`, ephemeral: true });
      }
    }

    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) {
        try { await cmd.execute(interaction, client); } catch(e){ console.error('cmd exec', e); await interaction.reply({ content: 'Command failed', ephemeral:true }); }
      }
    }
  } catch (err) {
    console.error('interaction error', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'Error', ephemeral:true }); } catch {}
  }
});

/* Start Discord client */
client.login(process.env.TOKEN).then(()=> console.log('Discord login ok')).catch(e=>console.error('discord login err', e.message || e));
