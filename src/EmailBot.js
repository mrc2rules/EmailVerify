require('dotenv').config();
const Discord = require('discord.js');
const {token, clientId} = require('../config/config.json');
const database = require('./database/Database.js')
const {stdin, stdout} = require('process')
const readline = require('readline')
let rl = null
const fs = require("fs");
const {getLocale, defaultLanguage} = require('./Language')
require("./database/ServerSettings");
const ServerStatsAPI = require("./api/ServerStatsAPI");
const topggAPI = require("./api/TopGG")
const MailSender = require("./mail/MailSender")
const sendVerifyMessage = require("./bot/sendVerifyMessage")
const {showEmailModal} = require("./bot/showEmailModal")
const rest = require("./api/DiscordRest")
const registerRemoveDomain = require("./bot/registerRemoveDomain")
const registerBlacklistChoices = require("./bot/registerBlacklistChoices")
const {PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, TextDisplayBuilder, EmbedBuilder} = require("discord.js");
const UserTimeout = require("./UserTimeout");
const md5hash = require("./crypto/Crypto");
const EmailUser = require("./database/EmailUser");
const { MessageFlags } = require('discord.js');
const { createSessionExpiredEmbed, createInvalidCodeEmbed, createInvalidEmailEmbed, createVerificationSuccessEmbed, createCodeSentEmbed } = require('./utils/embeds');
const ErrorNotifier = require('./utils/ErrorNotifier');
const { emailMatchesDomains, emailIsBlacklisted, getMatchingDomainPatterns } = require('./utils/wildcardMatch');

const bot = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.DirectMessages,
        Discord.GatewayIntentBits.GuildMessageReactions,
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.GuildMembers
    ],
    partials: [Discord.Partials.Channel]
});

const serverStatsAPI = new ServerStatsAPI(bot, false)
bot.serverStatsAPI = serverStatsAPI

let emailNotify = true

module.exports.userGuilds = userGuilds = new Map()

const userCodes = new Map()

let userTimeouts = new Map()

const mailSender = new MailSender(serverStatsAPI)

bot.userGuilds = userGuilds
bot.userCodes = userCodes
bot.userTimeouts = userTimeouts
bot.serverStatsAPI = serverStatsAPI

const verifyPromptMessages = new Map()
const codePromptMessages = new Map()

module.exports.verifyPromptMessages = verifyPromptMessages
module.exports.codePromptMessages = codePromptMessages

bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./src/commands').filter(file => file.endsWith('.js'));
const commands = []

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    bot.commands.set(command.data.name, command);
    commands.push(command.data.toJSON())
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function registerCommands(guild, count = 0, total = 0, attempt = 1) {
    try {
        await rest.put(
            Discord.Routes.applicationGuildCommands(clientId, guild.id),
            { body: commands }
        );
        console.log(`[Shard ${bot.shard?.ids ?? 'N/A'}] Successfully registered application commands for ${guild.name}: ${count}/${total}`);
    } catch (err) {
        const code = err?.code || err?.cause?.code;
        const status = err?.status ?? err?.statusCode;
        const discordCode = err?.rawError?.code;

        console.error(`[Shard ${bot.shard?.ids ?? 'N/A'}] Failed to register commands for ${guild.name} (attempt ${attempt}/${MAX_RETRIES}) – code=${code}, status=${status}, discordCode=${discordCode}`);

        const isTimeout = code === 'UND_ERR_CONNECT_TIMEOUT' || err?.message?.includes('Connect Timeout Error');

        if (isTimeout && attempt < MAX_RETRIES) {
            console.log(`Timeout while registering commands for ${guild.name}, retrying in ${RETRY_DELAY_MS}ms...`);
            await sleep(RETRY_DELAY_MS);
            return registerCommands(guild, count, total, attempt + 1);
        }

        const missingPerms = status === 403 || discordCode === 50013;

        if (missingPerms) {
            await ErrorNotifier.notify({
                guild: guild,
                errorTitle: 'Missing Permissions',
                errorMessage: 'The bot does not have permission to create slash commands. The bot will leave the server.\n\nTo fix this, please re-invite the bot with proper permissions: https://emailbot.larskaesberg.de/',
                language: 'english'
            });
            try {
                await bot.guilds.cache.get(guild.id)?.leave();
                console.log(`Left guild ${guild.name} due to missing permissions.`);
            } catch (e) {
                console.error(`Failed to leave guild ${guild.name}:`, e);
            }
            return;
        }

        console.warn(`Non-fatal error while registering commands for ${guild.name}. Not leaving guild; continuing.`);
    }
}

async function registerAllGuilds(bot) {
    const guilds = Array.from(bot.guilds.cache.values());
    const total = guilds.length;
    const concurrency = 5;
    let index = 0;

    async function worker() {
        while (true) {
            const i = index++;
            if (i >= total) break;
            const guild = guilds[i];
            const count = i + 1;
            await registerCommands(guild, count, total);
            registerRemoveDomain(guild.id);
            registerBlacklistChoices(guild.id);
            database.getServerSettings(guild.id, async serverSettings => {
                try {
                    await bot.guilds.cache.get(guild.id)?.channels.cache.get(serverSettings.channelID)?.messages.fetch(serverSettings.messageID);
                } catch (e) {}
            });
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    console.log(`[Shard ${bot.shard?.ids ?? 'N/A'}] Finished registering commands for all guilds`);
}

bot.once('clientReady', async () => {
    const isPrimary = !bot.shard || bot.shard.ids.includes(0)
    if (isPrimary) {
        serverStatsAPI.app.listen(serverStatsAPI.port, () => {
            console.log(`App listening on port ${serverStatsAPI.port}!`)
        })
        rl = readline.createInterface(stdin, stdout)
        rl.on("line", async command => {
            switch (command) {
                case "help":
                    console.log("Commands: email,servers")
                    break
                case "email":
                    emailNotify = !emailNotify
                    console.log("Email Notification: " + emailNotify.toString())
                    break
                case "servers":
                    console.log("------------------------------")
                    console.log("Servers:");
                    const servers = (await bot.guilds.fetch())
                    servers.forEach(guild => { console.log(guild.name) })
                    console.log("Server: " + servers.size)
                    console.log("------------------------------")
                    break
                default:
                    console.log("No command found!")
                    break
            }
        })
    }
    if (!bot.shard) {
        try {
            topggAPI(bot);
        } catch (e) {
            console.error('Failed to start TopGG API:', e);
        }
    }
    await registerAllGuilds(bot);
    bot.user.setActivity("/verify | Website", { type: "PLAYING", url: "https://emailbot.larskaesberg.de" });
});

setInterval(function () {
    bot.user.setActivity("/verify | Website", { type: "PLAYING", url: "https://emailbot.larskaesberg.de" })
}, 3600000);

bot.on("guildDelete", guild => {
    console.log("Removed: " + guild.name)
    database.deleteServerData(guild.id)
})

bot.on("guildMemberAdd", async member => {
    await database.getServerSettings(member.guild.id, async serverSettings => {
        if (serverSettings.autoAddUnverified) {
            const roleUnverified = member.guild.roles.cache.find(role => role.id === serverSettings.unverifiedRoleName);
            if (roleUnverified !== undefined) {
                try {
                    await member.roles.add(roleUnverified)
                } catch (e) {
                    await ErrorNotifier.notify({
                        guild: member.guild,
                        errorTitle: getLocale(serverSettings.language, 'errorRoleAssignTitle'),
                        errorMessage: getLocale(serverSettings.language, 'errorRoleAssignMessage'),
                        user: member.user,
                        language: serverSettings.language
                    })
                }
            }
        }
        if (serverSettings.autoVerify) {
            await sendVerifyMessage(member.guild, member.user, userGuilds)
        }
    })
})

bot.on('guildCreate', guild => {
    console.log(`[Shard ${bot.shard?.ids ?? 'N/A'}] New guild: ${guild.name}`)
    registerCommands(guild)
})

bot.on('messageCreate', async (message) => {
    if (message.author.bot) return
    if (message.content === "") return
    console.log(`[Shard ${bot.shard?.ids ?? 'N/A'}] Message created: "${message.content}" in ${message.guild?.name ?? 'DM'} by ${message.author.username} (${message.author.id})`)
})

bot.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return
        if (reaction.partial) { try { await reaction.fetch() } catch {} }
        const message = reaction.message
        const guild = message.guild
        if (!guild) return
        await database.getServerSettings(guild.id, async serverSettings => {
            if (message.channel.id === serverSettings.channelID && message.id === serverSettings.messageID) {
                try {
                    await message.channel.send(`<@${user.id}> Reaction-based verification is deprecated. Please contact a server admin and ask them to create a new verification flow with the /button command. Once the button message is available, click it to begin verification.`)
                } catch {}
            }
        })
    } catch {}
});

bot.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'verifyButton' || interaction.customId === 'openEmailModal') {
            const guild = interaction.guild || userGuilds.get(interaction.user.id)
            await showEmailModal(interaction, guild, userGuilds)
            return
        }
        if (interaction.customId === 'openCodeModal') {
            const userGuild = interaction.guild || userGuilds.get(interaction.user.id)
            if (!userGuild) {
                await interaction.reply({ embeds: [createSessionExpiredEmbed(true)], flags: MessageFlags.Ephemeral }).catch(() => {})
                return
            }
            const key = interaction.user.id + userGuild.id
            const userCode = userCodes.get(key)
            await database.getServerSettings(userGuild.id, async serverSettings => {
                const language = serverSettings.language
                let headerText = getLocale(language, 'codeModalHeader')
                if (userCode && userCode.logEmail) {
                    headerText += `\n\n📬 **Sent to:** ${userCode.logEmail}`
                }
                headerText += '\n\n-# Check your spam folder if you don\'t see the email'
                const modal = new ModalBuilder().setCustomId('codeModal').setTitle(getLocale(language, 'codeModalTitle'))
                const codeInput = new TextInputBuilder().setCustomId('codeInput').setStyle(TextInputStyle.Short).setPlaceholder(getLocale(language, 'codeModalPlaceholder')).setMinLength(6).setMaxLength(6).setRequired(true)
                const codeLabel = new LabelBuilder().setLabel(getLocale(language, 'codeModalLabel')).setTextInputComponent(codeInput)
                const headerDisplay = new TextDisplayBuilder().setContent(headerText)
                modal.addTextDisplayComponents(headerDisplay).addLabelComponents(codeLabel)
                await interaction.showModal(modal).catch(() => {})
                setTimeout(() => {
                    try {
                        if (interaction.message && interaction.message.id && interaction.message.flags?.has(MessageFlags.Ephemeral)) {
                            interaction.message.delete().catch(() => {})
                            interaction.webhook.deleteMessage(interaction.message.id).catch(() => {})
                        }
                    } catch {}
                }, 0)
            })
            return
        }
        return
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'emailModal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {})
            const emailText = interaction.fields.getTextInputValue('emailInput').trim()
            const userGuild = userGuilds.get(interaction.user.id)
            if (!userGuild) {
                await interaction.followUp({ embeds: [createSessionExpiredEmbed(false)], flags: MessageFlags.Ephemeral }).catch(() => {})
                return
            }
            await database.getServerSettings(userGuild.id, async serverSettings => {
                if (!serverSettings.status) {
                    await ErrorNotifier.notify({ guild: userGuild, errorTitle: getLocale(serverSettings.language, 'errorBotNotConfiguredTitle'), errorMessage: getLocale(serverSettings.language, 'errorBotNotConfiguredMessage'), user: interaction.user, interaction: interaction, language: serverSettings.language });
                    return
                }
                if (emailIsBlacklisted(emailText, serverSettings.blacklist)) {
                    const blacklistEmbed = new EmbedBuilder().setTitle(getLocale(serverSettings.language, "mailBlacklistedTitle")).setDescription(getLocale(serverSettings.language, "mailBlacklistedDescription")).setColor(0xED4245)
                    await interaction.followUp({ embeds: [blacklistEmbed], flags: MessageFlags.Ephemeral }).catch(() => {})
                    return
                }
                const hasValidFormat = emailText.split("@").length - 1 === 1 && !emailText.includes(' ')
                const matchesDomain = emailMatchesDomains(emailText, serverSettings.domains)
                if (!hasValidFormat || !matchesDomain) {
                    await interaction.followUp({ embeds: [createInvalidEmailEmbed(serverSettings.language)], flags: MessageFlags.Ephemeral }).catch(() => {})
                    return
                }
                let userTimeout = userTimeouts.get(interaction.user.id)
                if (!userTimeout) { userTimeout = new UserTimeout(); userTimeouts.set(interaction.user.id, userTimeout) }
                const timeoutMs = userTimeout.timestamp + userTimeout.waitseconds * 1000 - Date.now()
                if (timeoutMs > 0) {
                    const timeoutEmbed = new EmbedBuilder().setTitle(getLocale(serverSettings.language, "mailTimeoutTitle")).setDescription(getLocale(serverSettings.language, "mailTimeoutDescription", (timeoutMs / 1000).toFixed(0))).setColor(0xFFA500)
                    await interaction.followUp({ embeds: [timeoutEmbed], flags: MessageFlags.Ephemeral }).catch(() => {})
                    return
                }
                userTimeout.timestamp = Date.now()
                userTimeout.increaseWaitTime()
                const code = Math.floor((Math.random() + 1) * 100000).toString()
                await mailSender.sendEmail(emailText.toLowerCase(), code, userGuild.name, interaction, emailNotify, async (email) => {
                    userCodes.set(interaction.user.id + userGuild.id, { code: code, email: md5hash(email), logEmail: email })
                    const codePromptEmbed = createCodeSentEmbed(serverSettings.language, emailText.toLowerCase())
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('openCodeModal').setLabel(getLocale(serverSettings.language, 'enterCodeButton')).setEmoji('🔑').setStyle(ButtonStyle.Success))
                    const prevVerifyPromptId = verifyPromptMessages.get(interaction.user.id)
                    if (prevVerifyPromptId) { verifyPromptMessages.delete(interaction.user.id); interaction.webhook.deleteMessage(prevVerifyPromptId).catch(() => {}) }
                    await interaction.followUp({ embeds: [codePromptEmbed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => null)
                    const follow = await interaction.fetchReply().catch(() => null)
                    if (follow && follow.id) {
                        codePromptMessages.set(interaction.user.id + userGuild.id, follow.id)
                        setTimeout(() => { interaction.webhook.deleteMessage(follow.id).catch(() => {}) }, 300000)
                    }
                })
            })
            return
        }
        if (interaction.customId === 'codeModal') {
            const codeText = interaction.fields.getTextInputValue('codeInput').trim()
            const userGuild = userGuilds.get(interaction.user.id)
            if (!userGuild) {
                await interaction.reply({ embeds: [createSessionExpiredEmbed(true)], flags: MessageFlags.Ephemeral }).catch(() => null)
                const sent = await interaction.fetchReply().catch(() => null)
                setTimeout(() => { try { interaction.deleteReply().catch(() => {}) } catch {} try { if (sent && sent.id) interaction.webhook.deleteMessage(sent.id).catch(() => {}) } catch {} }, 10000)
                return
            }
            await database.getServerSettings(userGuild.id, async serverSettings => {
                if (!serverSettings.status) {
                    await ErrorNotifier.notify({ guild: userGuild, errorTitle: getLocale(serverSettings.language, 'errorBotNotConfiguredTitle'), errorMessage: getLocale(serverSettings.language, 'errorBotNotConfiguredMessage'), user: interaction.user, interaction: interaction, language: serverSettings.language });
                    return
                }
                const userCode = userCodes.get(interaction.user.id + userGuild.id)
                if (userCode && userCode.code === codeText) {
                    const defaultRoles = serverSettings.defaultRoles || []
                    const domainRoles = serverSettings.domainRoles || {}
                    const matchingPatterns = getMatchingDomainPatterns(userCode.logEmail, Object.keys(domainRoles))
                    const domainRoleIds = []
                    for (const pattern of matchingPatterns) { if (domainRoles[pattern]) { domainRoleIds.push(...domainRoles[pattern]) } }
                    const allRoleIds = [...new Set([...defaultRoles, ...domainRoleIds])]
                    const rolesToAdd = allRoleIds.map(id => userGuild.roles.cache.get(id)).filter(role => role !== undefined)
                    const roleUnverified = userGuild.roles.cache.find(role => role.id === serverSettings.unverifiedRoleName);
                    database.getEmailUser(userCode.email, userGuild.id, async (currentUserEmail) => {
                        let member = await userGuild.members.fetch(currentUserEmail.userID).catch(() => null)
                        if (interaction.user.id === currentUserEmail.userID) {
                        } else if (member) {
                            try { for (const role of rolesToAdd) { await member.roles.remove(role).catch(() => {}) } if (roleUnverified) { await member.roles.add(roleUnverified) } } catch (e) { console.log(e) }
                            try { await member.send("You got unverified on " + userGuild.name + " because somebody else used that email!").catch(() => {}) } catch {}
                        }
                    })
                    const primaryRoleId = defaultRoles.length > 0 ? defaultRoles[0] : (allRoleIds[0] || '')
                    database.updateEmailUser(new EmailUser(userCode.email, interaction.user.id, userGuild.id, primaryRoleId, 0))
                    const assignedRoleNames = []
                    try {
                        const verifyMember = await userGuild.members.fetch(interaction.user.id)
                        for (const role of rolesToAdd) { await verifyMember.roles.add(role); assignedRoleNames.push(role.name) }
                        if (serverSettings.unverifiedRoleName !== "") { await verifyMember.roles.remove(roleUnverified).catch(() => {}) }
                    } catch (e) {
                        await ErrorNotifier.notify({ guild: userGuild, errorTitle: getLocale(serverSettings.language, 'errorRoleAssignTitle'), errorMessage: getLocale(serverSettings.language, 'errorRoleAssignMessage'), user: interaction.user, interaction: interaction, language: serverSettings.language })
                        return
                    }
                    try { if (serverSettings.logChannel !== "") { const rolesText = assignedRoleNames.length > 0 ? ` [${assignedRoleNames.join(', ')}]` : ''; userGuild.channels.cache.get(serverSettings.logChannel).send(`✅ <@${interaction.user.id}> → \`${userCode.logEmail}\`${rolesText}`).catch(() => {}) } } catch {}
                    const successEmbed = createVerificationSuccessEmbed(serverSettings.language, assignedRoleNames, userGuild.name, userGuild.iconURL({ dynamic: true }))
                    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral }).catch(() => null)
                    const sent = await interaction.fetchReply().catch(() => null)
                    serverStatsAPI.increaseVerifiedUsers()
                    database.incrementVerifications(userGuild.id)
                    const codePromptId = codePromptMessages.get(interaction.user.id + userGuild.id)
                    if (codePromptId) { codePromptMessages.delete(interaction.user.id + userGuild.id); interaction.webhook.deleteMessage(codePromptId).catch(() => {}) }
                    setTimeout(() => { try { interaction.deleteReply().catch(() => {}) } catch {} try { if (sent && sent.id) interaction.webhook.deleteMessage(sent.id).catch(() => {}) } catch {} }, 20000)
                    userCodes.delete(interaction.user.id + userGuild.id)
                } else {
                    await interaction.reply({ embeds: [createInvalidCodeEmbed(serverSettings.language)], flags: MessageFlags.Ephemeral }).catch(() => null)
                    const sent = await interaction.fetchReply().catch(() => null)
                    const codePromptId = codePromptMessages.get(interaction.user.id + userGuild.id)
                    if (codePromptId) { codePromptMessages.delete(interaction.user.id + userGuild.id); interaction.webhook.deleteMessage(codePromptId).catch(() => {}) }
                    setTimeout(() => { try { interaction.deleteReply().catch(() => {}) } catch {} try { if (sent && sent.id) interaction.webhook.deleteMessage(sent.id).catch(() => {}) } catch {} }, 10000)
                }
            })
            return
        }
        return
    }

    if (interaction.isAutocomplete()) {
        const command = bot.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;
        try { await command.autocomplete(interaction); } catch (error) { console.error('Autocomplete error:', error); }
        return;
    }

    if (!interaction.isCommand()) return;
    const command = bot.commands.get(interaction.commandName);
    if (!command) return;
    if (interaction.user.id === bot.user.id) return;
    await database.getServerSettings(interaction.guild.id, async serverSettings => {
        let language
        try { language = serverSettings.language } catch { language = defaultLanguage }
        try {
            if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.commandName === "data" || interaction.commandName === "verify" || interaction.commandName === "globalstats") {
                await command.execute(interaction);
            } else {
                await interaction.reply({ content: getLocale(language, "invalidPermissions"), flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error(error);
            await ErrorNotifier.notify({ guild: interaction.guild, errorTitle: 'Command Execution Error', errorMessage: `Command \`/${interaction.commandName}\` failed with error:\n\`\`\`${error.message || error}\`\`\``, user: interaction.user, interaction: interaction, language: language })
        }
    })
});

process.on('SIGINT', () => process.exit(0))

bot.login(token).catch((e) => {
    console.log("Failed to login: " + e.toString())
    process.exitCode = 1;
});
