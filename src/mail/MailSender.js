let {smtpHost, email, username, password, isGoogle, isSecure, smtpPort} = require("../../config/config.json");

const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const {defaultLanguage, getLocale} = require("../Language");
const database = require("../database/Database");
const { MessageFlags } = require('discord.js');

if (typeof username === 'undefined') {
    username = email;
}

module.exports = class MailSender {
    constructor(userGuilds, serverStatsAPI) {
        this.userGuilds = userGuilds
        this.serverStatsAPI = serverStatsAPI
        let nodemailerOptions = {
            host: smtpHost,
            auth: {
                user: username,
                pass: password
            },
            tls: {
              rejectUnauthorized: false
            }
        }
        if (isGoogle) nodemailerOptions["service"] = "gmail"
        if (isSecure) nodemailerOptions["secure"] = isSecure
        if (smtpPort) nodemailerOptions["port"] = smtpPort


        this.transporter = nodemailer.createTransport(smtpTransport(nodemailerOptions));
    }

    async sendEmail(toEmail, code, name, message, emailNotify, callback, options = {}) {
        // message can be a DM Message or an Interaction (from modals/buttons)
        const isGuildInteraction = typeof message.guildId !== 'undefined' && message.guildId !== null;
        const userId = message.user ? message.user.id : message.author.id;
        const serverId = isGuildInteraction ? message.guildId : this.userGuilds.get(userId).id;

        await database.getServerSettings(serverId, serverSettings => {
            const mailOptions = {
                from: '"UTMJBC✉️" <'+ email +'>',
                to: toEmail,
                subject: '[UTMJBC] Your Discord verification code for ' + name,
                text: getLocale(serverSettings.language, "emailText", name, code),
                headers: {
                    'X-Mailer': 'UTMJBC Bot',
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'high',
                    'List-Unsubscribe': '<mailto:' + email + '?subject=unsubscribe>',
                    'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply'
                }
            };

            if (!isGoogle) mailOptions["bcc"] = email

            let language = ""
            try {
                language = serverSettings.language
            } catch {
                language = defaultLanguage
            }
            // Build modern HTML version while preserving the same text content
            const websiteUrl = 'https://utm.gitbook.io'
            const emailTextBase = getLocale(language, "emailText", name, code)
            const emailText = emailTextBase + "\n\n" + 'Learn more: ' + websiteUrl
            mailOptions.text = emailText
            mailOptions.html = this.#buildModernHtmlEmail(emailTextBase, name, code)
            this.transporter.sendMail(mailOptions, async (error, info) => {
                if (error || info.rejected.length > 0) {
                    if (emailNotify) {
                        console.log('EMAIL ERROR for:', toEmail);
                        console.log('Error details:', error);
                        if (info && info.rejected.length > 0) {
                            console.log('Rejected emails:', info.rejected);
                        }
                        if (info && info.response) {
                            console.log('SMTP Response:', info.response);
                        }
                    }
                    if (!options.suppressReply) {
                        const negative = getLocale(language, "mailNegative", toEmail)
                        if (isGuildInteraction) {
                            if (message.deferred || message.replied) {
                                await message.followUp({ content: negative, flags: MessageFlags.Ephemeral }).catch(() => {})
                            } else {
                                await message.reply({ content: negative, flags: MessageFlags.Ephemeral }).catch(() => {})
                            }
                        } else {
                            await message.reply(negative).catch(() => {})
                        }
                    }
                } else {
                    this.serverStatsAPI.increaseMailSend()
                    callback(info.accepted[0])
                    if (!options.suppressReply) {
                        const positive = getLocale(language, "mailPositive", toEmail)
                        if (isGuildInteraction) {
                            if (message.deferred || message.replied) {
                                await message.followUp({ content: positive, flags: MessageFlags.Ephemeral }).catch(() => {})
                            } else {
                                await message.reply({ content: positive, flags: MessageFlags.Ephemeral }).catch(() => {})
                            }
                        } else {
                            await message.reply(positive).catch(() => {})
                        }
                    }
                    if (emailNotify) {
                        console.log('EMAIL SUCCESS for:', toEmail);
                        console.log('Accepted emails:', info.accepted);
                        console.log('Message ID:', info.messageId);
                        console.log('SMTP Response:', info.response);
                    }
                }
            });
        })
    }

    #escapeHtml(input) {
        if (typeof input !== 'string') return input
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    #buildModernHtmlEmail(emailText, serverName, code) {
        const safeText = this.#escapeHtml(emailText || '')
        const safeServerName = this.#escapeHtml(serverName || '')
        const safeCode = this.#escapeHtml(code || '')

        // Convert plain text into paragraphs, preserving the exact wording
        const paragraphs = safeText
            .split(/\n+/)
            .filter(p => p.trim().length > 0)
            .map(p => `<p style="margin:0 0 16px 0; color:#3f3f46; font-size:16px; line-height:24px; font-family:'Poppins',sans-serif;">${p}</p>`)
            .join('')

        // Emphasize the code visually without changing the text itself
        const highlightedCode = `<div style="margin-top:12px; margin-bottom:4px;">
  <code style="display:inline-block; font-family: 'Courier New', monospace; font-size:22px; letter-spacing:2px; padding:12px 16px; background:#5A001C; color:#FFD700; border-radius:10px; font-weight:600;">${safeCode}</code>
</div>`

        // If the last paragraph already includes the code text, we still render the visual block below for modern layout
        const content = `${paragraphs}${highlightedCode}`

        return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Email Verification</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      /* Prevent auto-linking of numbers on iOS */
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      body { font-family: 'Poppins', sans-serif; }
    </style>
  </head>
  <body style="margin:0; padding:0; font-family:'Poppins',sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background:#f4f4f4; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(90,0,28,0.15);">
            <tr>
              <td style="background:linear-gradient(135deg,#5A001C,#FFD700); padding:20px 24px;">
                <div style="font-family:'Poppins',sans-serif; color:#ffffff;">
                  <div style="font-weight:700; font-size:18px; line-height:24px;">Email Verification</div>
                  <div style="opacity:0.9; font-size:14px; font-weight:400;">${safeServerName ? 'for ' + safeServerName : ''}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="font-family:'Poppins',sans-serif;">
                  ${content}
                  <div style="height:12px;"></div>
                  <hr style="border:none; border-top:1px solid #e5e7eb; margin:16px 0;" />
                  <p style="margin:0; color:#6b7280; font-size:12px; line-height:18px; font-family:'Poppins',sans-serif;">This email was sent by UTMJBC Bot. Learn more at <a href="https://utm.gitbook.io" style="color:#5A001C; text-decoration:underline; font-weight:600;">utm.gitbook.io</a>.</p>
                </div>
              </td>
            </tr>
          </table>
          <div style="font-family:'Poppins',sans-serif; color:#9ca3af; font-size:12px; margin-top:12px;">If you didn't request this, you can ignore this email.</div>
        </td>
      </tr>
    </table>
  </body>
</html>`
    }
}
