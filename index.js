const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== KONFIGURASI (DIAMBIL DARI RAILWAY ENV) =====
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const RECAP_CHANNEL_ID = process.env.RECAP_CHANNEL_ID;

// Path database agar awet di Railway Volume
// Kita simpan di folder /app/data/
const DATA_DIR = '/app/data';
const DATA_PATH = path.join(DATA_DIR, 'absensi.json');

// Pastikan folder data ada
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let absensi = {};
if (fs.existsSync(DATA_PATH)) {
  absensi = JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveDB() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2));
}

// ===== PANEL OTOMATIS =====
client.on('ready', async () => {
  console.log(`✅ Bot aktif sebagai ${client.user.tag}`);
  
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hadir')
        .setLabel('Hadir')
        .setStyle(ButtonStyle.Success)
    );
    // Kirim pesan panel baru setiap bot nyala
    channel.send({
      content: '📋 **Absensi Hari Ini**\nKlik tombol di bawah untuk hadir!',
      components: [row]
    });
  }
});

// ===== LOGIKA TOMBOL =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const userId = interaction.user.id;
    const member = interaction.member;

    let kelas = 'Umum';
    if (member.roles.cache.some(r => r.name.includes('IPA'))) kelas = '12 IPA';
    else if (member.roles.cache.some(r => r.name.includes('IPS'))) kelas = '12 IPS';
    else if (member.roles.cache.some(r => r.name.includes('Bahasa'))) kelas = '12 Bahasa';

    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(userId)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    // Simpan data
    absensi[tanggal].push(userId);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][userId] = (absensi.bulanan[bulanKey][userId] || 0) + 1;
    
    saveDB();

    const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel.send(`📋 ${interaction.user} | **${kelas}** | Jam ${jam} WIB`);
    }

    interaction.reply({ content: '✅ Absensi berhasil dicatat!', ephemeral: true });
  }
});

// Perintah Leaderboard
client.on('messageCreate', async (msg) => {
  if (msg.content === '!topbulan') {
    const now = new Date();
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = absensi.bulanan?.[bulanKey];
    if (!data) return msg.reply('Belum ada data bulan ini.');

    const sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const text = sorted.map((u,i)=>`${i+1}. <@${u[0]}> — ${u[1]} hari`).join('\n');
    msg.channel.send(`🏆 **Leaderboard Bulan Ini**\n${text}`);
  }
});

client.login(TOKEN);
