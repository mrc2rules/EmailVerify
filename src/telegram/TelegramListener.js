// src/telegram/TelegramListener.js
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Setup readline for the login code input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

class TelegramListener {
    constructor(discordBot, discordChannelId) {
        this.discordBot = discordBot;
        this.discordChannelId = discordChannelId;
        this.client = null;
        this.sessionFile = path.join(__dirname, 'tg_session.json');
        this.postedEvents = new Set();
        
        // Groups to monitor (Stored as strings to avoid BigInt precision issues)
        this.groups = [
            "-1001495028196", "-1001420970121", "-1002322216012", "-1002131243694",
            "-1001632225494", "-1001758696729", "-1001285638867", "-1001828594391",
            "-1001671508069", "-1002942058210", "-1001633128377", "-1001892552672",
            "-1003063343123", "-1001611178528", "-1001456357188", "-1001478964663",
            "-1001697428730", "-1001350513086", "-1001823400063", "-1001584697632",
            "-1002111025884", "-1001317987795", "-1001950731415", "-1002354465774",
            "-1002888115070"
        ];
        
        this.eventKeywords = [
            'event', 'workshop', 'seminar', 'conference', 'meetup',
            'talk', 'competition', 'hackathon', 'deadline', 'registration',
            'announcement', 'open day', 'recruitment', 'hiring', 'club',
            'activity', 'gathering', 'session', 'class', 'lecture'
        ];
    }

    async initialize() {
        try {
            const apiId = parseInt(process.env.TELEGRAM_API_ID);
            const apiHash = process.env.TELEGRAM_API_HASH;
            const phoneNumber = process.env.TELEGRAM_PHONE;

            if (!apiId || !apiHash || !phoneNumber) {
                console.error('❌ Missing Telegram credentials in .env');
                return false;
            }

            let session = new StringSession('');
            if (fs.existsSync(this.sessionFile)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'));
                    session = new StringSession(sessionData.session);
                    console.log('📂 Loaded existing Telegram session');
                } catch (e) {
                    console.log('📝 Creating new Telegram session');
                }
            }

            this.client = new TelegramClient(session, apiId, apiHash, {
                connectionRetries: 5,
            });

            await this.client.connect();

            // Check authorization
            if (!await this.client.isUserAuthorized()) {
                console.log('📱 Starting login flow...');
                await this.client.start({
                    phoneNumber: async () => phoneNumber,
                    phoneCode: async () => {
                        return new Promise((resolve) => {
                            rl.question('📩 Enter the code sent to your Telegram: ', resolve);
                        });
                    },
                    password: async () => {
                        return new Promise((resolve) => {
                            rl.question('🔐 Enter 2FA password (leave blank if none): ', resolve);
                        });
                    },
                    onError: (err) => console.error('Login error:', err),
                });
                this.saveSession();
            }

            console.log('✅ Logged in to Telegram');

            // Add Event Handler
            this.client.addEventHandler((event) => {
                this.handleNewMessage(event);
            }, new NewMessage({}));

            console.log('✅ Telegram listener active');
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            return false;
        }
    }

    saveSession() {
        try {
            const sessionString = this.client.session.save();
            fs.writeFileSync(this.sessionFile, JSON.stringify({ session: sessionString }));
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    }

    isEventMessage(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        return this.eventKeywords.some(keyword => lowerText.includes(keyword));
    }

    async postToDiscord(messageText, groupName) {
        try {
            const channel = await this.discordBot.channels.fetch(this.discordChannelId);
            if (!channel || channel.type !== 15) { // 15 is Forum
                console.error('❌ Channel is not a forum or not found');
                return;
            }

            const truncatedText = messageText.length > 2000 ? messageText.substring(0, 1990) + '...' : messageText;

            const embed = new EmbedBuilder()
                .setTitle('📢 UTM Event Found')
                .setDescription(truncatedText)
                .setColor(0x0099ff)
                .setFooter({ text: `Source: ${groupName}` })
                .setTimestamp();

            await channel.threads.create({
                name: `Event: ${groupName}`,
                message: { embeds: [embed] }
            });

            console.log(`🚀 Posted to Discord: ${groupName}`);
        } catch (error) {
            console.error('Discord Post Error:', error.message);
        }
    }

    async handleNewMessage(event) {
        try {
            const message = event.message;
            if (!message || !message.text || message.fwdFrom) return;

            // Handle BigInt Peer ID
            const peerId = message.peerId;
            let chatId = "";
            if (peerId.channelId) chatId = peerId.channelId.toString();
            else if (peerId.chatId) chatId = peerId.chatId.toString();

            // Match against groups list (handling the -100 prefix vs raw ID)
            const isMatch = this.groups.some(g => g.includes(chatId));
            if (!isMatch) return;

            if (!this.isEventMessage(message.text)) return;

            // Deduplication
            const hash = `${chatId}:${message.text.substring(0, 50)}`;
            if (this.postedEvents.has(hash)) return;
            this.postedEvents.add(hash);

            // Fetch Group Name
            const entity = await this.client.getEntity(message.peerId).catch(() => null);
            const groupName = entity?.title || 'Unknown UTM Group';

            await this.postToDiscord(message.text, groupName);
        } catch (error) {
            console.error('Message Handling Error:', error);
        }
    }
}

module.exports = TelegramListener;
