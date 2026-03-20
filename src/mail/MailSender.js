let {smtpHost, email, username, password, isGoogle, isSecure, smtpPort} = require("../../config/config.json");

const nodemailer = require("nodemailer");
const {defaultLanguage, getLocale} = require("../Language");
const database = require("../database/Database");
const { MessageFlags, EmbedBuilder } = require('discord.js');

if (typeof username === 'undefined') {
    username = email;
}

module.exports = class MailSender {
    constructor(serverStatsAPI) {
        this.serverStatsAPI = serverStatsAPI;

        let nodemailerOptions = {
            host: smtpHost,
            port: smtpPort || 587,
            secure: isSecure || false,
            name: smtpHost,
            auth: {
                user: username,
                pass: password
            },
            tls: {
                rejectUnauthorized: true
            }
        };

        if (isGoogle) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: username,
                    pass: password
                }
            });
        } else {
            this.transporter = nodemailer.createTransport(nodemailerOptions);
        }
    }

    /**
     * Send verification email
     * @param {string} toEmail - Email address to send to
     * @param {string} code - Verification code
     * @param {string} name - Server name
     * @param {Interaction} interaction - Discord interaction (modal/button)
     * @param {boolean} emailNotify - Whether to log email events to console
     * @param {Function} callback - Called with accepted email on success
     */
    async sendEmail(toEmail, code, name, interaction, emailNotify, callback) {
        const serverId = interaction.guildId;

        await database.getServerSettings(serverId, async serverSettings => {
            const language = serverSettings.language || defaultLanguage;

            const plainText = getLocale(language, "emailText", name, code);
            const emailSubject = getLocale(language, "emailSubject");
            const emailSenderName = getLocale(language, "emailSenderName");

            const mailOptions = {
                from: `"${emailSenderName}" <${username}>`,
                to: toEmail,
                subject: emailSubject,
                text: plainText,
                html: this.#buildModernHtmlEmail(name, code),
                headers: {
                    'X-Mailer': 'UTMJBC Bot',
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'high',
                    'List-Unsubscribe': `<mailto:${username}?subject=unsubscribe>`,
                    'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply'
                }
            };

            if (!isGoogle) mailOptions["bcc"] = email;

            this.transporter.sendMail(mailOptions, async (error, info) => {
                if (error || info.rejected.length > 0) {
                    if (emailNotify) {
                        console.log('EMAIL ERROR for:', toEmail);
                        console.log('Error details:', error);
                        if (info && info.rejected.length > 0) console.log('Rejected emails:', info.rejected);
                        if (info && info.response) console.log('SMTP Response:', info.response);
                    }

                    const errorEmbed = new EmbedBuilder()
                        .setTitle(getLocale(language, "mailFailedTitle"))
                        .setDescription(getLocale(language, "mailFailedDescription", toEmail))
                        .setColor(0xED4245);

                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
                    }
                } else {
                    this.serverStatsAPI.increaseMailSend();
                    database.incrementMailsSent(serverId);
                    callback(info.accepted[0]);
                    if (emailNotify) {
                        console.log('EMAIL SUCCESS for:', toEmail);
                        console.log('Accepted emails:', info.accepted);
                        console.log('Message ID:', info.messageId);
                        console.log('SMTP Response:', info.response);
                    }
                }
            });
        });
    }

    #escapeHtml(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    #buildModernHtmlEmail(serverName, code) {
        const safeServerName = this.#escapeHtml(serverName || '');
        const safeCode = this.#escapeHtml(code || '');

        return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <style type="text/css">
    body { width: 100% !important; -webkit-text-size-adjust: 100%; margin: 0; padding: 0; background-color: #1a0008; font-family: 'Poppins', Arial, sans-serif; }
    img { outline: none; text-decoration: none; border: none; }
    table { border-collapse: collapse; }
    @media only screen and (max-width: 600px) {
      .main-table { width: 100% !important; }
      .content-cell { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body bgcolor="#1a0008" style="margin: 0; padding: 0; background-color: #1a0008;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#1a0008">
    <tr>
      <td align="center" valign="top" style="padding: 40px 10px;">

        <table class="main-table" border="0" cellpadding="0" cellspacing="0" width="600" bgcolor="#2a0010" style="background-color: #2a0010; border: 1px solid #5A001C; border-radius: 8px;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 40px 20px 24px;">
              <img src="https://i.imgur.com/GmnbsON.png" alt="UTM JBC" width="220" style="display: block; width: 220px; height: auto;">
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="center" style="padding: 0 40px 24px;">
              <h1 style="color: #FFD700; font-family: 'Poppins', Arial, sans-serif; font-size: 22px; font-weight: 700; margin: 0; line-height: 1.3;">Welcome to UTM Johor Bahru Community!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-cell" style="padding: 0 40px 32px; font-family: 'Poppins', Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #e2d0d6;">

              <p style="margin: 0 0 16px 0;">To ensure that this is a safe space for UTM students only, we require new members to verify. Upon verification, you will gain access to a number of different channels; such as faculty channels, UTM discussion and so much more!</p>

              <p style="margin: 0 0 24px 0;">Please enter the following code in Discord to complete your verification:</p>

              <!-- Code Block -->
              <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-family: 'Poppins', Arial, sans-serif; font-size: 28px; letter-spacing: 6px; padding: 14px 28px; background: #5A001C; color: #FFD700; border: 1px solid #FFD700; border-radius: 8px; font-weight: 700;">${safeCode}</span>
              </div>

              <p style="margin: 24px 0 0 0; color: #FFD700; font-weight: 600; font-size: 14px; text-align: center;">⚠️ Do NOT share this code with anyone other than the UTMJBC Bot.</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #5A001C; margin: 0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="#1a0008" style="padding: 24px 40px; background-color: #1a0008;">
              <p style="color: #b08090; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; line-height: 1.6; margin: 0 0 12px;">For any queries, feel free to reply to this email and we'll get back to you.</p>

              <!-- Footer Links -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="https://utm.gitbook.io/" target="_blank" style="color: #FFD700; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; font-weight: 600; text-decoration: none; border-bottom: 1px solid #FFD700; padding-bottom: 1px;">📖 Community Guide</a>
                  </td>
                  <td style="padding: 0 12px; border-left: 1px solid #5A001C;">
                    <a href="https://discord.gg/vuGTVyFgck" target="_blank" style="color: #FFD700; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; font-weight: 600; text-decoration: none; border-bottom: 1px solid #FFD700; padding-bottom: 1px;">💬 Join Discord</a>
                  </td>
                </tr>
              </table>

              <a href="mailto:utmjbc@gmail.com" style="color: #b08090; font-family: 'Poppins', Arial, sans-serif; font-size: 11px; font-weight: 400; text-decoration: none; letter-spacing: 0.5px;">utmjbc@gmail.com</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    }
}
