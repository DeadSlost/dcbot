// ============================================================
// Mythicmon Launcher - Discord Notification Bot
// ============================================================
// Comandos:
//   /notificar    - Enviar notificacion inmediata al launcher
//   /programar    - Programar notificacion con temporizador
//   /notificaciones - Ver notificaciones actuales
//   /borrar       - Borrar una notificacion por ID
// ============================================================

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js')
const https = require('https')
const fs = require('fs')
const path = require('path')

// ─── Configuracion ───────────────────────────────────────────
// Cargar .env manualmente (sin dotenv)
function loadEnv() {
    const envPath = path.join(__dirname, '.env')
    if (!fs.existsSync(envPath)) {
        console.error('ERROR: No se encontro el archivo .env')
        console.error('Copia .env.example como .env y rellena los valores')
        process.exit(1)
    }
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.substring(0, eqIdx).trim()
        const val = trimmed.substring(eqIdx + 1).trim()
        process.env[key] = val
    }
}
loadEnv()

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'DeadSlost'
const GITHUB_REPO = process.env.GITHUB_REPO || 'distro'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH || 'notifications.json'

if (!DISCORD_TOKEN || !GUILD_ID || !GITHUB_TOKEN) {
    console.error('ERROR: Faltan variables en .env (DISCORD_TOKEN, GUILD_ID, GITHUB_TOKEN)')
    process.exit(1)
}

// ─── GitHub API helpers ──────────────────────────────────────

function githubRequest(method, apiPath, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: apiPath,
            method: method,
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'MythicmonBot/1.0',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        }
        if (body) {
            options.headers['Content-Type'] = 'application/json'
        }

        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) })
                } catch {
                    resolve({ status: res.statusCode, data: data })
                }
            })
        })
        req.on('error', reject)
        if (body) req.write(JSON.stringify(body))
        req.end()
    })
}

async function getNotificationsFile() {
    const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`
    const res = await githubRequest('GET', apiPath)

    if (res.status === 404) {
        // Archivo no existe, crear vacio
        return { notifications: [], sha: null }
    }
    if (res.status !== 200) {
        throw new Error(`GitHub API error ${res.status}: ${JSON.stringify(res.data)}`)
    }

    const content = Buffer.from(res.data.content, 'base64').toString('utf-8')
    const notifications = JSON.parse(content)
    return { notifications, sha: res.data.sha }
}

async function saveNotificationsFile(notifications, sha) {
    const apiPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`
    const content = Buffer.from(JSON.stringify(notifications, null, 2)).toString('base64')
    const body = {
        message: `Notificacion actualizada via Discord Bot`,
        content: content,
        branch: GITHUB_BRANCH
    }
    if (sha) body.sha = sha

    const res = await githubRequest('PUT', apiPath, body)
    if (res.status !== 200 && res.status !== 201) {
        throw new Error(`GitHub API error al guardar: ${res.status}`)
    }
    return res
}

// ─── Tipos de notificacion ───────────────────────────────────
const NOTIF_TYPES = {
    'actualizacion': 'update',
    'evento': 'event',
    'mantenimiento': 'maintenance',
    'consejo': 'tip',
    'aviso': 'warning',
    'info': 'info'
}

const NOTIF_EMOJIS = {
    'update': '🚀',
    'event': '🌟',
    'maintenance': '🔧',
    'tip': '💡',
    'warning': '⚠️',
    'info': 'ℹ️'
}

const NOTIF_COLORS = {
    'update': 0x3498db,
    'event': 0xe74c3c,
    'maintenance': 0xf39c12,
    'tip': 0x2ecc71,
    'warning': 0xe67e22,
    'info': 0x9b59b6
}

// ─── Temporizadores programados ──────────────────────────────
const scheduledNotifs = new Map()

// ─── Discord Client ──────────────────────────────────────────
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
})

// ─── Registrar Slash Commands ────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('notificar')
        .setDescription('Enviar notificacion al launcher de Mythicmon')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('titulo')
                .setDescription('Titulo de la notificacion')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(opt =>
            opt.setName('mensaje')
                .setDescription('Contenido de la notificacion')
                .setRequired(true)
                .setMaxLength(500)
        )
        .addStringOption(opt =>
            opt.setName('tipo')
                .setDescription('Tipo de notificacion')
                .setRequired(false)
                .addChoices(
                    { name: '🚀 Actualizacion', value: 'actualizacion' },
                    { name: '🌟 Evento', value: 'evento' },
                    { name: '🔧 Mantenimiento', value: 'mantenimiento' },
                    { name: '💡 Consejo', value: 'consejo' },
                    { name: '⚠️ Aviso', value: 'aviso' },
                    { name: 'ℹ️ Info', value: 'info' }
                )
        ),

    new SlashCommandBuilder()
        .setName('programar')
        .setDescription('Programar notificacion con temporizador')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('titulo')
                .setDescription('Titulo de la notificacion')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(opt =>
            opt.setName('mensaje')
                .setDescription('Contenido de la notificacion')
                .setRequired(true)
                .setMaxLength(500)
        )
        .addIntegerOption(opt =>
            opt.setName('minutos')
                .setDescription('Enviar en X minutos')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10080) // Max 7 dias
        )
        .addStringOption(opt =>
            opt.setName('tipo')
                .setDescription('Tipo de notificacion')
                .setRequired(false)
                .addChoices(
                    { name: '🚀 Actualizacion', value: 'actualizacion' },
                    { name: '🌟 Evento', value: 'evento' },
                    { name: '🔧 Mantenimiento', value: 'mantenimiento' },
                    { name: '💡 Consejo', value: 'consejo' },
                    { name: '⚠️ Aviso', value: 'aviso' },
                    { name: 'ℹ️ Info', value: 'info' }
                )
        ),

    new SlashCommandBuilder()
        .setName('notificaciones')
        .setDescription('Ver todas las notificaciones actuales del launcher')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('borrar')
        .setDescription('Borrar una notificacion del launcher por su ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('id')
                .setDescription('ID de la notificacion a borrar')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('pendientes')
        .setDescription('Ver notificaciones programadas pendientes')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('cancelar')
        .setDescription('Cancelar una notificacion programada')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('id')
                .setDescription('ID de la notificacion programada a cancelar')
                .setRequired(true)
        )
]

// ─── Funciones auxiliares ────────────────────────────────────

function generateId(title) {
    const slug = title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 30)
    return `discord-${slug}-${Date.now().toString(36)}`
}

function formatDate(date) {
    return date.toISOString().split('T')[0]
}

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} minuto${minutes > 1 ? 's' : ''}`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (m === 0) return `${h} hora${h > 1 ? 's' : ''}`
    return `${h}h ${m}m`
}

async function sendNotification(title, message, typeName, interaction = null) {
    const type = NOTIF_TYPES[typeName] || 'info'
    const id = generateId(title)
    const newNotif = {
        id,
        type,
        title,
        message,
        date: formatDate(new Date())
    }

    try {
        const { notifications, sha } = await getNotificationsFile()
        notifications.unshift(newNotif) // Add at the top

        // Keep max 50 notifications
        if (notifications.length > 50) {
            notifications.length = 50
        }

        await saveNotificationsFile(notifications, sha)

        const embed = new EmbedBuilder()
            .setColor(NOTIF_COLORS[type])
            .setTitle(`${NOTIF_EMOJIS[type]} Notificacion Enviada`)
            .addFields(
                { name: 'Titulo', value: title, inline: true },
                { name: 'Tipo', value: `${NOTIF_EMOJIS[type]} ${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`, inline: true },
                { name: 'ID', value: `\`${id}\``, inline: false },
                { name: 'Mensaje', value: message }
            )
            .setFooter({ text: 'Los jugadores veran esta notificacion en el launcher' })
            .setTimestamp()

        return embed
    } catch (error) {
        console.error('Error al enviar notificacion:', error)
        const errorEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Error')
            .setDescription(`No se pudo enviar la notificacion:\n\`${error.message}\``)
            .setTimestamp()
        return errorEmbed
    }
}

// ─── Manejar interacciones ───────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return

    const { commandName } = interaction

    // ── /notificar ──
    if (commandName === 'notificar') {
        await interaction.deferReply()
        const titulo = interaction.options.getString('titulo')
        const mensaje = interaction.options.getString('mensaje')
        const tipo = interaction.options.getString('tipo') || 'info'
        const embed = await sendNotification(titulo, mensaje, tipo, interaction)
        await interaction.editReply({ embeds: [embed] })
    }

    // ── /programar ──
    else if (commandName === 'programar') {
        const titulo = interaction.options.getString('titulo')
        const mensaje = interaction.options.getString('mensaje')
        const minutos = interaction.options.getInteger('minutos')
        const tipo = interaction.options.getString('tipo') || 'info'
        const type = NOTIF_TYPES[tipo] || 'info'
        const scheduleId = `sched-${Date.now().toString(36)}`
        const sendTime = new Date(Date.now() + minutos * 60 * 1000)

        const timeout = setTimeout(async () => {
            const embed = await sendNotification(titulo, mensaje, tipo)
            scheduledNotifs.delete(scheduleId)

            // Send confirmation to the channel
            try {
                const channel = interaction.channel
                if (channel) {
                    const confirmEmbed = new EmbedBuilder()
                        .setColor(NOTIF_COLORS[type])
                        .setTitle('⏰ Notificacion Programada Enviada')
                        .setDescription(`La notificacion **"${titulo}"** ha sido enviada al launcher.`)
                        .addFields({ name: 'Programada por', value: `<@${interaction.user.id}>` })
                        .setTimestamp()
                    await channel.send({ embeds: [confirmEmbed] })
                }
            } catch (e) {
                console.error('No se pudo enviar confirmacion al canal:', e)
            }
        }, minutos * 60 * 1000)

        scheduledNotifs.set(scheduleId, {
            id: scheduleId,
            titulo,
            mensaje,
            tipo,
            minutos,
            sendTime,
            timeout,
            user: interaction.user.tag
        })

        const embed = new EmbedBuilder()
            .setColor(NOTIF_COLORS[type])
            .setTitle('⏰ Notificacion Programada')
            .addFields(
                { name: 'Titulo', value: titulo, inline: true },
                { name: 'Tipo', value: `${NOTIF_EMOJIS[type]} ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`, inline: true },
                { name: 'Se enviara en', value: formatDuration(minutos), inline: true },
                { name: 'Hora de envio', value: `<t:${Math.floor(sendTime.getTime() / 1000)}:F>`, inline: false },
                { name: 'ID', value: `\`${scheduleId}\``, inline: false },
                { name: 'Mensaje', value: mensaje }
            )
            .setFooter({ text: 'Usa /cancelar para anular | /pendientes para ver todas' })
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    }

    // ── /notificaciones ──
    else if (commandName === 'notificaciones') {
        await interaction.deferReply()

        try {
            const { notifications } = await getNotificationsFile()

            if (notifications.length === 0) {
                await interaction.editReply('No hay notificaciones en el launcher.')
                return
            }

            const list = notifications.slice(0, 15).map((n, i) => {
                const emoji = NOTIF_EMOJIS[n.type] || 'ℹ️'
                return `${emoji} **${n.title}**\n> ${n.message.substring(0, 80)}${n.message.length > 80 ? '...' : ''}\n> ID: \`${n.id}\` | Fecha: ${n.date}`
            }).join('\n\n')

            const embed = new EmbedBuilder()
                .setColor(0xE3350D)
                .setTitle('📋 Notificaciones del Launcher')
                .setDescription(list)
                .setFooter({ text: `Mostrando ${Math.min(15, notifications.length)} de ${notifications.length} notificaciones` })
                .setTimestamp()

            await interaction.editReply({ embeds: [embed] })
        } catch (error) {
            await interaction.editReply(`❌ Error al obtener notificaciones: ${error.message}`)
        }
    }

    // ── /borrar ──
    else if (commandName === 'borrar') {
        await interaction.deferReply()
        const targetId = interaction.options.getString('id')

        try {
            const { notifications, sha } = await getNotificationsFile()
            const idx = notifications.findIndex(n => n.id === targetId)

            if (idx === -1) {
                await interaction.editReply(`❌ No se encontro notificacion con ID \`${targetId}\``)
                return
            }

            const removed = notifications.splice(idx, 1)[0]
            await saveNotificationsFile(notifications, sha)

            const embed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('🗑️ Notificacion Borrada')
                .addFields(
                    { name: 'Titulo', value: removed.title, inline: true },
                    { name: 'ID', value: `\`${removed.id}\``, inline: true }
                )
                .setTimestamp()

            await interaction.editReply({ embeds: [embed] })
        } catch (error) {
            await interaction.editReply(`❌ Error: ${error.message}`)
        }
    }

    // ── /pendientes ──
    else if (commandName === 'pendientes') {
        if (scheduledNotifs.size === 0) {
            await interaction.reply('No hay notificaciones programadas pendientes.')
            return
        }

        const list = Array.from(scheduledNotifs.values()).map(s => {
            const type = NOTIF_TYPES[s.tipo] || 'info'
            const emoji = NOTIF_EMOJIS[type]
            return `${emoji} **${s.titulo}**\n> Envio: <t:${Math.floor(s.sendTime.getTime() / 1000)}:R>\n> ID: \`${s.id}\` | Por: ${s.user}`
        }).join('\n\n')

        const embed = new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle('⏰ Notificaciones Programadas')
            .setDescription(list)
            .setFooter({ text: 'Usa /cancelar <id> para anular' })
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    }

    // ── /cancelar ──
    else if (commandName === 'cancelar') {
        const scheduleId = interaction.options.getString('id')

        if (!scheduledNotifs.has(scheduleId)) {
            await interaction.reply(`❌ No se encontro notificacion programada con ID \`${scheduleId}\``)
            return
        }

        const sched = scheduledNotifs.get(scheduleId)
        clearTimeout(sched.timeout)
        scheduledNotifs.delete(scheduleId)

        const embed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('❌ Notificacion Cancelada')
            .setDescription(`La notificacion **"${sched.titulo}"** ha sido cancelada.`)
            .setTimestamp()

        await interaction.reply({ embeds: [embed] })
    }
})

// ─── Bot listo ───────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`)
    console.log(`📡 Registrando comandos en el servidor ${GUILD_ID}...`)

    const rest = new REST().setToken(DISCORD_TOKEN)

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands.map(c => c.toJSON()) }
        )
        console.log(`✅ ${commands.length} comandos registrados correctamente`)
        console.log('')
        console.log('Comandos disponibles:')
        console.log('  /notificar  - Enviar notificacion inmediata')
        console.log('  /programar  - Programar con temporizador')
        console.log('  /notificaciones - Ver notificaciones actuales')
        console.log('  /borrar     - Borrar notificacion por ID')
        console.log('  /pendientes - Ver programadas pendientes')
        console.log('  /cancelar   - Cancelar programada')
    } catch (error) {
        console.error('Error al registrar comandos:', error)
    }
})

// ─── Iniciar bot ─────────────────────────────────────────────
client.login(DISCORD_TOKEN)
