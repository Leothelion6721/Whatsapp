# Email Invitation Setup Guide

This application uses Mailjet API to send meeting invitation emails to participants.

## Prerequisites

1. Create a free Mailjet account at [https://www.mailjet.com](https://www.mailjet.com)
2. Get your API credentials from [https://app.mailjet.com/account/apikeys](https://app.mailjet.com/account/apikeys)

## Configuration

### Step 1: Get Your Mailjet API Credentials

You provided the API Key: `F26FADC590F1FAC70BC378EF5E264C98`

**IMPORTANT:** You also need your **Mailjet Secret Key** which was not provided. To find it:

1. Log in to your Mailjet account
2. Go to Account Settings > API Keys
3. You'll see both:
   - **API Key** (Public key)
   - **Secret Key** (Private key - keep this secure!)

### Step 2: Create Environment File

1. Copy the `.env.example` file to create a new `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and add your credentials:
   ```env
   # Mailjet Configuration
   MAILJET_API_KEY=F26FADC590F1FAC70BC378EF5E264C98
   MAILJET_SECRET_KEY=your_secret_key_here_from_mailjet

   # Email Settings
   SENDER_EMAIL=noreply@yourdomain.com
   APP_URL=http://localhost:3000
   ```

### Step 3: Verify Sender Email

For Mailjet to send emails, you need to verify your sender email address:

1. Go to [Mailjet Sender Addresses](https://app.mailjet.com/account/sender)
2. Add and verify your sender email address
3. Use this verified email in the `SENDER_EMAIL` environment variable

### Step 4: Restart Server

After configuring the environment variables:
```bash
npm start
```

You should see the message:
```
📧 Mailjet email service initialized
```

If you see a warning instead, check your credentials.

## Features

### Email Templates

The application sends beautiful HTML email invitations with:
- Meeting title and description
- Formatted date and time
- Duration
- Organizer name
- Direct link to join the meeting
- Professional WhatsApp-themed design

### User Registration

New users must provide:
- Username (3-20 characters)
- Email address (valid format)
- Password (minimum 6 characters)

### Meeting Invitations

When creating a meeting:
1. Check the "Send invitations to participants via chat" checkbox
2. Participants will receive:
   - In-app chat invitation with meeting details
   - Email invitation to their registered email address

## Troubleshooting

### Emails Not Sending?

1. **Check console logs** for error messages
2. **Verify credentials** in `.env` file
3. **Confirm sender email** is verified in Mailjet
4. **Check Mailjet dashboard** for delivery status
5. **Review spam folder** in recipient's email

### Common Issues

**Issue:** "Email service not configured"
- **Solution:** Add both `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` to `.env`

**Issue:** "Invalid API credentials"
- **Solution:** Double-check your API key and secret from Mailjet dashboard

**Issue:** "Sender email not verified"
- **Solution:** Verify your sender email in Mailjet account settings

## Security Best Practices

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Never commit `.env` file** - It's already in `.gitignore`
2. **Keep API credentials secret** - Don't share them publicly
3. **Use environment variables** - Never hardcode credentials in source code
4. **Rotate keys regularly** - Generate new API keys periodically
5. **Use different keys** for development and production

## Testing

To test email functionality:

1. Register a new user with a valid email address
2. Add contacts and schedule a meeting
3. Enable "Send invitations to participants"
4. Check:
   - Server console for email send confirmation
   - Mailjet dashboard for delivery status
   - Recipient's email inbox (and spam folder)

## Mailjet Limits

Free Mailjet plan includes:
- 6,000 emails per month
- 200 emails per day
- No credit card required

For production use with higher volume, consider upgrading your Mailjet plan.

## Support

- Mailjet Documentation: https://dev.mailjet.com/
- Mailjet Support: https://www.mailjet.com/support/

## Environment Variables Reference

```env
# Required for email functionality
MAILJET_API_KEY=your_api_key
MAILJET_SECRET_KEY=your_secret_key

# Optional customization
SENDER_EMAIL=noreply@yourdomain.com  # Must be verified in Mailjet
APP_URL=http://localhost:3000        # URL users will be directed to

# Other app settings
PORT=3000
JWT_SECRET=your-secret-key
```
