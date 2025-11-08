# 📧 Outlook Email Setup for Render

## Quick Setup for Outlook/Hotmail Users

Since you're using **Outlook** (not Gmail), here are the specific settings you need:

### Step 1: Your Outlook Account

You can use your regular Outlook password (no app password needed for most accounts).

**If you have 2FA enabled on Outlook:**
- You may need to generate an app password
- Go to [Microsoft Account Security](https://account.microsoft.com/security)
- Look for "App passwords" and create one

### Step 2: Render Environment Variables

Go to **Render Dashboard → Your Service → Environment** and add:

```
EMAIL_USER = yourname@outlook.com
EMAIL_PASS = your-outlook-password (or app password if 2FA enabled)
EMAIL_HOST = smtp-mail.outlook.com
EMAIL_PORT = 587
```

**Alternative settings if 587 times out:**
```
EMAIL_USER = yourname@outlook.com
EMAIL_PASS = your-outlook-password
EMAIL_HOST = smtp.office365.com
EMAIL_PORT = 587
```

**If you're STILL getting connection timeout:**
```
EMAIL_USER = yourname@outlook.com
EMAIL_PASS = your-outlook-password
EMAIL_HOST = smtp-mail.outlook.com
EMAIL_PORT = 465
```

### Step 3: Important Outlook Notes

**Port Recommendations for Outlook on Render:**
1. **Try 587 first** (Outlook's preferred port with STARTTLS)
2. **If that times out, try 465** (SSL - more reliable on cloud platforms)

**Outlook SMTP Hosts:**
- `smtp-mail.outlook.com` - Standard Outlook/Hotmail
- `smtp.office365.com` - Office 365 accounts
- Both should work, try the first one first

**Email Addresses That Work:**
- `yourname@outlook.com` ✅
- `yourname@hotmail.com` ✅
- `yourname@live.com` ✅
- `yourname@yourdomain.com` ✅ (if using Office 365)

### Step 4: Test Configuration

After saving in Render, check logs for:

```
✅ Email service configured
✅ Email service ready to send messages
```

If you see:
```
❌ Email service error: Connection timeout
```

**Try this order:**
1. First try: `smtp-mail.outlook.com` with port `587`
2. If timeout: `smtp-mail.outlook.com` with port `465`
3. If still timeout: `smtp.office365.com` with port `587`
4. Last resort: `smtp.office365.com` with port `465`

### Common Outlook Issues

**Problem: "Invalid login" or "Authentication failed"**

Solutions:
- Make sure you're using your correct Outlook password
- If you have 2FA: Generate an app password
- Check if your account requires additional security verification

**Problem: "Connection timeout"**

This is the issue you're experiencing! Solutions:
1. Change `EMAIL_PORT` from `587` to `465` in Render
2. Make sure `EMAIL_HOST` is exactly `smtp-mail.outlook.com`
3. No typos in email/password!

**Problem: Microsoft blocks automated sending**

Outlook is generally good about automated emails, but if you get blocked:
- Verify your account at https://account.microsoft.com
- Make sure account is in good standing
- Consider using a Microsoft 365 business account for production

### Example Configuration

**In Render Dashboard → Environment:**

| Variable | Value |
|----------|-------|
| `EMAIL_USER` | `john.smith@outlook.com` |
| `EMAIL_PASS` | `YourOutlookPassword123!` |
| `EMAIL_HOST` | `smtp-mail.outlook.com` |
| `EMAIL_PORT` | `465` |

### Testing

1. Save the environment variables in Render
2. Wait for automatic redeploy
3. Check logs - look for `✅ Email service ready to send messages`
4. Try password reset feature
5. Check your inbox (or spam folder)

### Still Not Working?

If you've tried all the above:

1. **Verify credentials manually:**
   - Try logging into Outlook webmail with your password
   - Make sure the password is exactly what you entered in Render

2. **Check Render logs for specific errors:**
   - Look for exact error message
   - Share the error if you need more help

3. **Try port 465 with SSL:**
   - This is the most reliable for cloud platforms
   - Update `EMAIL_PORT` to `465` in Render

4. **Alternative: Try a different email provider:**
   - Gmail with app password (very reliable)
   - SendGrid (free tier, purpose-built for apps)

---

**Quick Reference:**

✅ Outlook works great with Render
✅ Use port 465 for most reliable connection
✅ No app password needed (unless 2FA enabled)
✅ Both outlook.com and hotmail.com work
