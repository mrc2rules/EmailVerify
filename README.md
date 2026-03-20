<!--
*** UTM Johor Bahru Community - Email Verify Bot
-->

<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a><img src="https://i.imgur.com/GmnbsON.png" alt="UTM JBC" width="300" title="UTM JBC"></a>
  <h3 align="center">UTM JBC Email Verification Bot</h3>
  <p align="center">
    Email verification and specialized AI powered query bot for UTM JBC.
  </p>

  <p align="center">
    <img src="https://img.shields.io/github/actions/workflow/status/mrc2rules/EmailVerify/ci.yml?style=for-the-badge" alt="Build Status">
    <img src="https://img.shields.io/github/license/mrc2rules/EmailVerify?style=for-the-badge" alt="License">
    <img src="https://img.shields.io/github/forks/mrc2rules/EmailVerify?style=for-the-badge&logo=github&logoColor=white" alt="Forks">
    <img src="https://img.shields.io/github/stars/mrc2rules/EmailVerify?style=for-the-badge&logo=github&logoColor=white" alt="Stars">
  </p>

  <p align="center">
    </a>
    <a href="https://discord.gg/vuGTVyFgck">
      <img src="https://img.shields.io/discord/1407328981929431071?style=for-the-badge&logo=discord&logoColor=7289da&label=Join%20Discord&color=7289da" alt="Join Discord">
    </a>
  </p>
</p>

---

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary><h2 style="display: inline-block">📋 Table of Contents</h2></summary>
  <ol>
    <li><a href="#-about">About</a></li>
    <li><a href="#-how-it-works">How It Works</a></li>
    <li><a href="#-commands">Commands</a></li>
    <li>
      <a href="#-self-hosting">Self Hosting</a>
      <ul>
        <li><a href="#docker-recommended">Docker (Recommended)</a></li>
        <li><a href="#manual-installation">Manual Installation</a></li>
      </ul>
    </li>
    <li><a href="#-contributors">Contributors</a></li>
  </ol>
</details>

---

## 📖 About

This is the official bot for the **UTMJBC** Discord server. It handles email verification for students and provides an AI-powered query system to answer questions relevant to UTM students.

- Email verification to confirm student identity
- AI-powered grounded query system for UTM-related questions, with the help of UTMWiki (https://utm.gitbook.io/) 

> ⚠️ **Disclaimer:** UTM Johor Bahru Community (UTMJBC) and this project are **not affiliated with or endorsed by Universiti Teknologi Malaysia (UTM)** in any way. This is an independent student-run community.

---

## 📝 Commands

### 👤 User Commands

| Command | Description |
|---------|-------------|
| `/verify` | Start the email verification process |
| `/data delete-user` | Delete your verification data and remove verified status |

### 👥 Role Configuration

| Command | Description |
|---------|-------------|
| `/role add <role>` | Add a default role given to all verified users |
| `/role remove <role>` | Remove a role from the default roles list |
| `/role list` | View all default roles |
| `/role unverified [role]` | Set or view the optional role for unverified members |

### 🎭 Domain-Specific Roles

| Command | Description |
|---------|-------------|
| `/domainrole add <domain> <role>` | Add a role for a specific email domain |
| `/domainrole remove <domain> <role>` | Remove a role from a domain |
| `/domainrole list` | View all domain-role mappings |
| `/domainrole clear <domain>` | Remove all roles for a domain |

### 📧 Domain Management

| Command | Description |
|---------|-------------|
| `/domain add <domains>` | Add allowed email domains (supports `*` wildcard) |
| `/domain remove <domains>` | Remove allowed domains |
| `/domain list` | View all allowed domains |
| `/domain clear` | Remove all allowed domains |

### 🚫 Blacklist Management

| Command | Description |
|---------|-------------|
| `/blacklist add <patterns>` | Block email patterns (supports `*` wildcard) |
| `/blacklist remove <patterns>` | Unblock patterns |
| `/blacklist list` | View all blacklisted entries |
| `/blacklist clear` | Remove all blacklist entries |

### ⚙️ Settings

| Command | Description |
|---------|-------------|
| `/settings language <lang>` | Change the bot's language |
| `/settings log-channel [channel]` | Set or disable the verification log channel |
| `/settings verify-message [message]` | Set or reset custom message in verification emails |
| `/settings auto-verify <enable>` | Auto-prompt new members to verify on join |
| `/settings auto-unverified <enable>` | Auto-assign unverified role to new members |

### 🛡️ Moderation & Setup

| Command | Description |
|---------|-------------|
| `/button <channel> <buttontext>` | Create a verification button embed in a channel |
| `/manualverify <user> <email>` | Manually verify a user without email confirmation |
| `/set_error_notify` | Configure where error notifications are sent |

### 📊 Information

| Command | Description |
|---------|-------------|
| `/status` | View bot configuration, statistics, and check for issues |
| `/help` | Show setup instructions and command overview |

### ⚠️ Data Management

| Command | Description |
|---------|-------------|
| `/data delete-user` | Delete your personal verification data |
| `/data delete-server` | Delete all server data and reset the bot |

> ⚠️ **Note:** Most commands require administrator permissions

### Important: Role Hierarchy

The bot role **must be higher** in the role hierarchy than the verified and unverified roles, otherwise role assignment will fail.

---

## 🐳 Self Hosting

### Docker (Recommended)

#### 1. Create a directory for the bot
```bash
mkdir emailverify && cd emailverify
```

#### 2. Create the config file
```bash
mkdir config
nano config/config.json
```

```json
{
  "token": "<Discord Bot Token>",
  "clientId": "<Discord Bot Client ID>",
  "email": "<Email Address>",
  "username": "<Mail Server Username>",
  "password": "<Email Password>",
  "smtpHost": "<SMTP Server>",
  "isGoogle": false
}
```

#### 3. Create docker-compose.yml
```yaml
version: '3'
services:
  emailverify:
    image: ghcr.io/lkaesberg/emailverify:latest
    ports:
      - 8181:8181
    volumes:
      - ./config:/usr/app/config
    restart: always
```

#### 4. Start the bot
```bash
docker-compose up -d
```

---

### Manual Installation

**Requirements:** Node.js v16.15.0 or higher

#### 1. Clone the repository
```bash
git clone https://github.com/mrc2rules/EmailVerify.git
cd EmailVerify
```

#### 2. Create the config file
```bash
nano config/config.json
```

```json
{
  "token": "<Discord Bot Token>",
  "clientId": "<Discord Bot Client ID>",
  "email": "<Email Address>",
  "username": "<Mail Server Username>",
  "password": "<Email Password>",
  "smtpHost": "<SMTP Server>",
  "isGoogle": false
}
```

#### 3. Install dependencies and start
```bash
npm install
npm start
```

---

### Configuration Options

| Option | Description |
|--------|-------------|
| `token` | Your Discord Bot Token from the [Discord Developer Portal](https://discord.com/developers/applications) |
| `clientId` | Your Discord Bot's Client ID |
| `email` | The email address that will send verification codes |
| `username` | SMTP server username (usually your email address) |
| `password` | SMTP server password or App Password |
| `smtpHost` | Your SMTP server (e.g., `smtp.gmail.com`) |
| `isGoogle` | Set to `true` if using Gmail |

> 💡 **Gmail Users:** You need to create an [App Password](https://support.google.com/accounts/answer/185833) instead of using your regular password.

### Debugging

Type `email` in the console to enable debugging messages for email errors.

---

## 👥 Contributors

### UTMJBC Development
- **mrc2rules** - [GitHub](https://github.com/mrc2rules)

### Original Project
This bot is based on [EmailVerify](https://github.com/lkaesberg/EmailVerify) by [Lars Kaesberg](https://github.com/lkaesberg).

---

<p align="center">
  Made with ❤️ for the UTM Johor Bahru Community<br/><br/>
  <a href="https://discord.gg/vuGTVyFgck">
    <img src="https://img.shields.io/discord/1407328981929431071?style=for-the-badge&logo=discord&logoColor=7289da&label=Join%20Discord&color=7289da" alt="Join Discord">
  </a>
  &nbsp;
  <a href="https://utm.gitbook.io/">
    <img src="https://img.shields.io/badge/Community%20Guide-5A001C?style=for-the-badge&logoColor=white" alt="Community Guide">
  </a>
  &nbsp;
  <a href="mailto:utmjbc@gmail.com">
    <img src="https://img.shields.io/badge/utmjbc@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Email">
  </a>
</p>
