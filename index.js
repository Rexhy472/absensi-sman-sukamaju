const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- KONFIGURASI ---
const TOKEN = process.env.TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const DATA_DIR = '/app/data';
const DATA_PATH = path.join(DATA_DIR, 'absensi.json');

// Pastikan folder data ada (Railway Volume)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let absensi = {};
if (fs.existsSync(DATA_PATH)) {
  absensi = JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2));
  } catch (err) {
    console.error("Gagal menyimpan database:", err);
  }
}

// --- BOT READY ---
client.on('ready', () => {
  console.log(`✅ Online sebagai ${client.user.tag}`);
  
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hadir')
        .setLabel('Hadir')
        .setStyle(ButtonStyle.Success)
    );
    channel.send({
      content: '📋 **Absensi Hari Ini**\nSilahkan klik tombol di bawah untuk mencatat kehadiran.',
      components: [row]
    }).catch(err => console.error("Gagal kirim panel:", err));
  } else {
    console.log("⚠️ PERINGATAN: Panel Channel ID tidak ditemukan!");
  }
});

// --- LOGIKA TOMBOL ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    const userId = interaction.user.id;
    const member = interaction.member;

    // Deteksi Role
    let kelas = 'Umum/Lainnya';
    let warna = 0x95a5a6;
    let emoji = '👤';

    const roles = member.roles.cache;
    if (roles.some(r => r.name.toUpperCase().includes('IPA'))) {
      kelas = 'Kelas 12 IPA'; warna = 0x3498db; emoji = '🧪';
    } else if (roles.some(r => r.name.toUpperCase().includes('IPS'))) {
      kelas = 'Kelas 12 IPS'; warna = 0xe67e22; emoji = '📊';
    } else if (roles.some(r => r.name.toUpperCase().includes('BAHASA'))) {
      kelas = 'Kelas 12 Bahasa'; warna = 0xf1c40f; emoji = '📒';
    }

    // Cek Absen
    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(userId)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    // Simpan Data
    absensi[tanggal].push(userId);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][userId] = (absensi.bulanan[bulanKey][userId] || 0) + 1;
    saveDB();

    // Kirim Log Embed
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(warna)
        .setTitle('📋 Absensi Masuk')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '👤 Nama Siswa', value: `${interaction.user.username}`, inline: true },
          { name: `${emoji} Kelas`, value: `${kelas}`, inline: true },
          { name: '⏰ Waktu Hadir', value: `${jam} WIB`, inline: false }
        )
        .setTimestamp();

      logChannel.send({ embeds: [logEmbed] }).catch(err => console.error("Gagal kirim log:", err));
    }

    await interaction.reply({ content: `✅ Berhasil! Kamu tercatat di **${kelas}**.`, ephemeral: true });
  }
});

// --- COMMANDS ---
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // 1. RECAP
  if (msg.content === '!recap') {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.reply('Hanya Admin yang bisa rekap! ❌');
    }

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    const data = absensi[today] || [];
    
    const ipa = [], ips = [], bahasa = [], umum = [];
    for (const id of data) {
      const target = msg.guild.members.cache.get(id);
      if (!target) { umum.push(id); continue; }
      
      const r = target.roles.cache;
      if (r.some(x => x.name.toUpperCase().includes('IPA'))) ipa.push(id);
      else if (r.some(x => x.name.toUpperCase().includes('IPS'))) ips.push(id);
      else if (r.some(x => x.name.toUpperCase().includes('BAHASA'))) bahasa.push(id);
      else umum.push(id);
    }

    const fmt = (arr) => arr.length === 0 ? '_Kosong_' : arr.map(id => `• <@${id}>`).join('\n');

    const em = new EmbedBuilder()
      .setColor(0x34495e)
      .setTitle(`📊 Rekap Absensi: ${today}`)
      .addFields(
        { name: '🧪 IPA', value: fmt(ipa), inline: true },
        { name: '📊 IPS', value: fmt(ips), inline: true },
        { name: '📒 Bahasa', value: fmt(bahasa), inline: true },
        { name: '👤 Umum', value: fmt(umum), inline: false }
      )
      .setFooter({ text: `Total: ${data.length} Siswa` });

    msg.channel.send({ embeds: [em] });
  }

  // 2. TOP BULANAN
  if (msg.content === '!topbulan') {
    const now = new Date();
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = absensi.bulanan?.[bulanKey];

    if (!data) return msg.reply('Belum ada data bulan ini.');

    const sorted = Object.entries(data).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const list = sorted.map((u, i) => `**${i+1}.** <@${u[0]}> — ${u[1]} Hari`).join('\n');

    msg.channel.send({
      embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(`🏆 Top Absensi ${bulanKey}`).setDescription(list)]
    });
  }

  // 3. RESET (Testing)
  if (msg.content === '!reset') {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    delete absensi[today];
    saveDB();
    msg.reply('✅ Data hari ini direset.');
  }
});

client.login(TOKEN);
