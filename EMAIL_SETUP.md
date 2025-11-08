# 📧 Email Setup Guide

This guide explains how to enable real email sending for password reset functionality.

## 🌟 Overview

The password reset feature can:
- **Send real emails** when email is configured (production mode)
- **Log to console** when email is not configured (development mode)

## 🚀 Quick Setup

### Step 1: Create Environment File

Copy the example file:
```bash
cp .env.example .env
```

### Step 2: Configure Email Settings

Edit `.env` and add your email credentials:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_FROM=noreply@yourdomain.com
```

### Step 3: Restart Server

```bash
npm start
```

Look for this message:
```
✅ Email service configured
✅ Email service ready to send messages
```

## 📮 Provider-Specific Setup

### Gmail (Recommended)

1. **Enable 2-Step Verification:**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Create App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password

3. **Configure `.env`:**
   ```env
   EMAIL_USER=yourname@gmail.com
   EMAIL_PASS=abcdefghijklmnop
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   ```

### Outlook/Hotmail

```env
EMAIL_USER=yourname@outlook.com
EMAIL_PASS=your-password
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
```

### Yahoo

1. **Generate App Password:**
   - Go to https://login.yahoo.com/account/security
   - Generate app password

2. **Configure `.env`:**
   ```env
   EMAIL_USER=yourname@yahoo.com
   EMAIL_PASS=your-app-password
   EMAIL_HOST=smtp.mail.yahoo.com
   EMAIL_PORT=587
   ```

### Custom SMTP Server

```env
EMAIL_USER=admin@yourdomain.com
EMAIL_PASS=your-password
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=587
```

## 🔐 Security Best Practices

### Use App Passwords

**Never use your main email password!** Always create app-specific passwords:
- **Gmail:** App Passwords (requires 2FA)
- **Yahoo:** App Passwords
- **Outlook:** Use account password or app password

### Environment Variables

**Never commit `.env` to git!** It's already in `.gitignore`.

```bash
# .gitignore already includes:
.env
```

### Production Deployment

For production (Heroku, AWS, etc.), set environment variables:

#### Heroku:
```bash
heroku config:set EMAIL_USER=your-email@gmail.com
heroku config:set EMAIL_PASS=your-app-password
heroku config:set EMAIL_HOST=smtp.gmail.com
heroku config:set EMAIL_PORT=587
```

#### AWS/Docker:
Add to your deployment configuration or docker-compose.yml

## 📧 Email Template

The system sends a beautiful HTML email with:
- **Professional design** with WhatsApp branding
- **Large verification code** (easy to read)
- **Security warnings** (if they didn't request reset)
- **Expiration notice** (15 minutes)
- **Plain text fallback** (for older email clients)

### Email Preview:

```
┌─────────────────────────────────────┐
│              🔐                      │
│        Password Reset                │
├─────────────────────────────────────┤
│ Hello username,                      │
│                                      │
│ Your Verification Code:              │
│                                      │
│         ┌───────────┐               │
│         │  123456   │               │
│         └───────────┘               │
│                                      │
│ Expires in 15 minutes                │
└─────────────────────────────────────┘
```

## 🧪 Testing

### Test Email Configuration

1. **Start server and check logs:**
   ```
   ✅ Email service configured
   ✅ Email service ready to send messages
   ```

2. **Try password reset:**
   - Go to login page
   - Click "Forgot Password?"
   - Enter email address
   - Check your inbox!

3. **Check server logs:**
   ```
   ✅ Password reset email sent to user@example.com
      Message ID: <unique-id@server>
      Reset code: 123456 (expires in 15 minutes)
   ```

### Troubleshooting

#### Error: "Invalid credentials"
- Check EMAIL_USER and EMAIL_PASS are correct
- For Gmail, make sure you're using App Password, not main password
- Verify 2FA is enabled for Gmail

#### Error: "Connection timeout"
- Check EMAIL_HOST is correct
- Try changing EMAIL_PORT (587 or 465)
- Check firewall isn't blocking SMTP

#### No email received
- Check spam folder
- Verify email address is correct
- Check server logs for errors
- Try sending test email with different provider

## 🔄 Fallback Mode

If email is not configured, the system automatically falls back to **console mode**:

```
╔════════════════════════════════════════════╗
║   PASSWORD RESET EMAIL (Console Mode)     ║
╠════════════════════════════════════════════╣
║ To: user@example.com                       ║
║ Verification Code: 123456                  ║
╚════════════════════════════════════════════╝
```

Perfect for:
- **Local development**
- **Testing without email**
- **Email service debugging**

## 📊 Supported Email Providers

| Provider | SMTP Host | Port | App Password Required |
|----------|-----------|------|----------------------|
| Gmail | smtp.gmail.com | 587 | Yes (with 2FA) |
| Outlook | smtp-mail.outlook.com | 587 | No |
| Yahoo | smtp.mail.yahoo.com | 587 | Yes |
| SendGrid | smtp.sendgrid.net | 587 | API Key |
| Mailgun | smtp.mailgun.org | 587 | API Key |
| Custom | your-server | 587/465 | Depends |

## 🎯 Common SMTP Ports

- **587** - STARTTLS (recommended, most secure)
- **465** - SSL/TLS (alternative)
- **25** - Plain (not recommended, often blocked)

## 💡 Tips

1. **Use a dedicated email** for sending (e.g., noreply@yourdomain.com)
2. **Monitor email quota** - Most providers have daily limits
3. **Test regularly** - Email configuration can break
4. **Keep credentials secure** - Never share or commit `.env`
5. **Use app passwords** - Never use main account password

## 📞 Support

If you need help:
1. Check the error message in server logs
2. Verify your email provider's SMTP settings
3. Test with a different email provider
4. Check firewall/antivirus isn't blocking SMTP

## ✅ Verification Checklist

- [ ] `.env` file created from `.env.example`
- [ ] Email credentials added to `.env`
- [ ] Server shows "Email service ready"
- [ ] Test email sent successfully
- [ ] Email received in inbox (check spam)
- [ ] `.env` file is in `.gitignore`
- [ ] Using app password (not main password)

---

**Ready to go!** 🚀 Your password reset emails will now be sent to real inboxes!
