const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== ENV =====
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const PANEL_CHANNEL_ID = 'ISI_CHANNEL_PANEL';
const LOG_CHANNEL_ID = 'ISI_CHANNEL_LOG';
const RECAP_CHANNEL_ID = 'ISI_CHANNEL_RECAP';

// ===== DATA =====
let absensi = {};
if (fs.existsSync('absensi.json')) {
  absensi = JSON.parse(fs.readFileSync('absensi.json'));
}

// ===== PANEL OTOMATIS =====
client.on('ready', async () => {
  console.log(`Bot aktif sebagai ${client.user.tag}`);

  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('hadir')
      .setLabel('Hadir')
      .setStyle(ButtonStyle.Success)
  );

  if (channel) {
    channel.send({
      content: '📋 **Absensi Hari Ini**\nKlik tombol 👇',
      components: [row]
    });
  }
});

// ===== ABSENSI TOMBOL =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const userId = interaction.user.id;
    const member = interaction.member;

    let kelas = 'Tidak diketahui';

    if (member.roles.cache.some(r => r.name.includes('IPA'))) kelas = 'Kelas 12 IPA';
    else if (member.roles.cache.some(r => r.name.includes('IPS'))) kelas = 'Kelas 12 IPS';
    else if (member.roles.cache.some(r => r.name.includes('Bahasa'))) kelas = 'Kelas 12 Bahasa';

    if (!absensi[tanggal]) absensi[tanggal] = [];

    if (absensi[tanggal].includes(userId)) {
      return interaction.reply({ content: 'Kamu sudah absen ✅', ephemeral: true });
    }

    absensi[tanggal].push(userId);

    // ===== BULANAN =====
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};

    if (!absensi.bulanan[bulanKey][userId]) {
      absensi.bulanan[bulanKey][userId] = 0;
    }

    absensi.bulanan[bulanKey][userId] += 1;

    fs.writeFileSync('absensi.json', JSON.stringify(absensi, null, 2));

    // ===== LOG =====
    const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);

    if (logChannel) {
      logChannel.send(
`📋 ${interaction.user} | ${kelas} | ${jam} WIB`
      );
    }

    interaction.reply({
      content: '✅ Absensi berhasil!',
      ephemeral: true
    });
  }
});

// ===== RECAP =====
async function sendRecap(client) {
  const channel = client.channels.cache.get(RECAP_CHANNEL_ID);
  if (!channel) return;

  const today = new Date().toLocaleDateString('id-ID');
  const data = absensi[today];

  if (!data || data.length === 0) {
    return channel.send(`📊 Rekap\n${today}\nBelum ada 😴`);
  }

  const guild = channel.guild;

  const roleIPA = guild.roles.cache.find(r => r.name.includes('IPA'));
  const roleIPS = guild.roles.cache.find(r => r.name.includes('IPS'));
  const roleBahasa = guild.roles.cache.find(r => r.name.includes('Bahasa'));

  const ipa = [], ips = [], bahasa = [];

  for (const id of data) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) continue;

    if (roleIPA && member.roles.cache.has(roleIPA.id)) ipa.push(id);
    else if (roleIPS && member.roles.cache.has(roleIPS.id)) ips.push(id);
    else if (roleBahasa && member.roles.cache.has(roleBahasa.id)) bahasa.push(id);
  }

  const format = arr =>
    arr.length === 0 ? 'Tidak ada' : arr.map((id, i) => `${i+1}. <@${id}>`).join('\n');

  channel.send(
`📊 **Rekap ${today}**

🫀 IPA (${ipa.length})
${format(ipa)}

📊 IPS (${ips.length})
${format(ips)}

📒 Bahasa (${bahasa.length})
${format(bahasa)}`
  );
}

// ===== LEADERBOARD =====
client.on('messageCreate', async (msg) => {
  if (msg.content === '!topbulan') {
    const now = new Date();
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const data = absensi.bulanan?.[bulanKey];
    if (!data) return msg.reply('Belum ada data 😅');

    const sorted = Object.entries(data)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,10);

    const text = sorted.map((u,i)=>`${i+1}. <@${u[0]}> — ${u[1]} hari`).join('\n');

    msg.channel.send(`🏆 **Leaderboard Bulan Ini**\n${text}`);
  }
});

// ===== ROLE REWARD =====
async function giveRewardRole(guild) {
  const now = new Date();
  const bulanKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;

  const data = absensi.bulanan?.[bulanKey];
  if (!data) return;

  const top = Object.entries(data).sort((a,b)=>b[1]-a[1])[0];
  if (!top) return;

  const member = await guild.members.fetch(top[0]).catch(()=>null);
  const role = guild.roles.cache.find(r=>r.name==='Siswa Terajin');

  if (member && role) {
    await member.roles.add(role);
  }
}

// ===== SCHEDULER =====
let lastRecap = null;

setInterval(() => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

  const jam = now.getHours();
  const menit = now.getMinutes();
  const tanggal = now.getDate();

  const today = now.toLocaleDateString('id-ID');

  // recap 23:59
  if (jam === 23 && menit === 59 && lastRecap !== today) {
    lastRecap = today;
    sendRecap(client);
  }

  // reward tiap tanggal 1 jam 00:00
  if (tanggal === 1 && jam === 0 && menit === 0) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) giveRewardRole(guild);
  }

}, 60 * 1000);

client.login(TOKEN);
