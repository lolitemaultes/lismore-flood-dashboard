# Deployment Guide for flood.lolitemaultes.online

## 🚨 CRITICAL: Fix Your Current Errors

Based on your error logs, you have **3 issues** to fix:

### Error 1: Wrong Node.js Version
```
ReferenceError: ReadableStream is not defined
```
**Problem:** You're running Node.js 14 or 16, but this app requires Node.js 18+

**Solution:** Upgrade to Node.js 18 (LTS) or higher in your hosting panel

### Error 2: Wrong Directory Path
```
/home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/server.js
```
**Problem:** You're pointing to the ROOT `server.js` (which doesn't exist)

**Correct Path:** `/home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/lismore-flood-proxy/server.js`

### Error 3: Dependencies Not Installed
```
Error: Cannot find module 'express'
```
**Problem:** npm packages not installed

**Solution:** Run `npm install` in the `lismore-flood-proxy` directory

---

## 📋 Step-by-Step Deployment (cPanel/LiteSpeed)

### Step 1: SSH into Your Server

```bash
ssh your-username@flood.lolitemaultes.online
```

### Step 2: Navigate to Correct Directory

```bash
cd /home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/lismore-flood-proxy
```

**Important:** Make sure you're in the `lismore-flood-proxy` folder!

### Step 3: Check Node.js Version

```bash
node --version
```

**You need:** Node.js 18.0.0 or higher (Node 18 LTS recommended)

**If you have Node 16 or lower:**

#### Option A: Use cPanel Node.js Selector (RECOMMENDED)
1. Log into cPanel
2. Go to "Setup Node.js App" or "Node.js Selector"
3. Select Node.js version **18.x LTS** (NOT 16.x or 14.x)
4. Set the application root to: `lismore-flood-dashboard/lismore-flood-proxy`
5. Click "Save"

#### Option B: Use NVM (if SSH access)
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js 18 LTS
nvm install 18
nvm use 18
nvm alias default 18

# Verify
node --version  # Should show v18.x.x
```

### Step 4: Install Dependencies

```bash
# Make sure you're in lismore-flood-proxy directory!
pwd  # Should show: /home/lolizzmg/.../lismore-flood-proxy

# Install packages
npm install
```

**Expected output:**
```
added 85 packages, and audited 86 packages in 5s
```

**If you get errors:** Delete `node_modules` and `package-lock.json` first:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Step 5: Test Locally First

```bash
# Start the server
node server.js
```

**Expected output:**
```
┌────────────────────────────────────────────────────────────┐
│            LISMORE FLOOD DASHBOARD SERVER                  │
└────────────────────────────────────────────────────────────┘
[timestamp] OK    Directory structure verified
[timestamp] INFO  Periodic cleanup scheduled (every 5 minutes)
[timestamp] OK    Server running on port 3000
```

**If it works:** Press `Ctrl+C` to stop, then continue to Step 6

**If it fails:** See troubleshooting section below

### Step 6: Configure cPanel Node.js App

1. **Log into cPanel**

2. **Find "Setup Node.js App"** (or similar)

3. **Create New Application:**
   - **Node.js Version:** 18.x LTS (NOT 16.x or 14.x)
   - **Application Mode:** Production
   - **Application Root:** `lismore-flood-dashboard/lismore-flood-proxy`
   - **Application URL:** `https://flood.lolitemaultes.online`
   - **Application Startup File:** `server.js`
   - **Environment Variables:** (add these)
     ```
     PORT=3000
     NODE_ENV=production
     ```

4. **Click "Create"**

5. **Click "Run NPM Install"** button

6. **Click "Restart"**

### Step 7: Configure .htaccess (if needed)

If your app isn't loading, create/edit `.htaccess` in your document root:

**Location:** `/home/lolizzmg/public_html/.htaccess` or similar

```apache
# Redirect HTTP to HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Proxy to Node.js app
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

### Step 8: Verify Deployment

Visit these URLs to test:

1. **Main Site:** https://flood.lolitemaultes.online/
   - Should load the dashboard

2. **API Test:** https://flood.lolitemaultes.online/status
   - Should return JSON:
   ```json
   {
     "status": "online",
     "timestamp": "2025-11-05T...",
     "uptime": 123.456
   }
   ```

3. **Webcam Test:** https://flood.lolitemaultes.online/proxy/webcam
   - Should load an image

4. **Check Browser Console:** (F12 → Console tab)
   - Should have NO errors
   - Should NOT see any "mixed content" warnings

---

## 🔧 Troubleshooting

### Issue: "Cannot find module 'express'"

**Cause:** Dependencies not installed in correct location

**Fix:**
```bash
cd /home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/lismore-flood-proxy
rm -rf node_modules package-lock.json
npm install
```

### Issue: "ReferenceError: ReadableStream is not defined"

**Cause:** Node.js version too old (you have v14 or v16, need v18+)

**Fix:** Upgrade Node.js to version 18 LTS in cPanel

**Why Node 18?** Modern dependencies (like axios/undici) require the `ReadableStream` API, which is only stable in Node 18+

### Issue: "EADDRINUSE: Port 3000 already in use"

**Cause:** Another app is using port 3000

**Fix 1:** Kill the existing process:
```bash
lsof -ti:3000 | xargs kill -9
```

**Fix 2:** Use a different port:
```bash
PORT=3001 node server.js
```

### Issue: Server starts but site doesn't load

**Cause:** Reverse proxy not configured or wrong application root

**Fix:**
1. Check application root in cPanel is: `lismore-flood-dashboard/lismore-flood-proxy`
2. NOT: `lismore-flood-dashboard` (missing subfolder)
3. Check `.htaccess` is proxying to correct port

### Issue: "Mixed content" warnings in browser

**Cause:** This shouldn't happen if deployed correctly

**Fix:** Verify HTTPS is working:
```bash
curl -I https://flood.lolitemaultes.online/status
```

Should show: `HTTP/2 200`

---

## 📁 Correct Directory Structure

Your deployment should look like this:

```
/home/lolizzmg/flood.lolitemaultes.online/
├── lismore-flood-dashboard/              ← Git repo root
│   ├── README.md
│   ├── LICENSE
│   ├── DEPLOYMENT.md                     ← This file
│   └── lismore-flood-proxy/              ← APPLICATION ROOT (set this in cPanel)
│       ├── server.js                     ← Entry point
│       ├── package.json
│       ├── node_modules/                 ← Installed here via npm install
│       │   ├── express/
│       │   ├── axios/
│       │   └── ...
│       └── public/
│           ├── index.html
│           ├── css/
│           ├── js/
│           └── resources/
```

---

## ✅ Verification Checklist

Before going live, confirm:

- [ ] Node.js version is 18+ (`node --version` shows v18.x.x)
- [ ] You're in `lismore-flood-proxy` directory
- [ ] Dependencies installed (`ls node_modules/` shows packages)
- [ ] Server starts without errors (`node server.js`)
- [ ] cPanel Application Root is `lismore-flood-dashboard/lismore-flood-proxy`
- [ ] Application Startup File is `server.js` (not full path)
- [ ] HTTPS certificate is valid
- [ ] https://flood.lolitemaultes.online/ loads
- [ ] https://flood.lolitemaultes.online/status returns JSON
- [ ] No console errors in browser (F12)

---

## 🚀 Quick Fix Commands

Run these in order if still having issues:

```bash
# 1. Go to correct directory
cd /home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/lismore-flood-proxy

# 2. Check Node version (must be 18+)
node --version

# If not 18, upgrade in cPanel to Node.js 18.x LTS

# 3. Clean install dependencies
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# 4. Test server
node server.js

# 5. If working, stop and configure cPanel to start it
# Press Ctrl+C, then use cPanel "Setup Node.js App"
```

---

## 🆘 Still Having Issues?

1. **Check your error logs:**
   ```bash
   tail -f /home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/stderr.log
   ```

2. **Check if port is listening:**
   ```bash
   netstat -tulpn | grep :3000
   ```

3. **Verify file permissions:**
   ```bash
   ls -la /home/lolizzmg/flood.lolitemaultes.online/lismore-flood-dashboard/lismore-flood-proxy/
   ```

4. **Test connectivity:**
   ```bash
   curl http://localhost:3000/status
   ```

---

## 📞 Common cPanel Hosting Providers

### If using these providers:

**Hostinger:**
- Use "Node.js" option in hPanel
- Set root to `lismore-flood-dashboard/lismore-flood-proxy`
- Node version: 18.x

**SiteGround:**
- Use "Node.js Manager" in Site Tools
- Set entry point to `server.js`
- Node version: 18.x

**A2 Hosting:**
- Use "Setup Node.js App" in cPanel
- Set application root correctly
- Enable "Passenger" for auto-restart

**Namecheap:**
- Enable Node.js in cPanel
- Set document root to app folder
- Configure environment variables

---

## 🎯 Expected Result

When everything is working:

1. Visit **https://flood.lolitemaultes.online/**
2. You should see the flood dashboard
3. Webcam updates in real-time
4. All maps and data load without errors
5. No "mixed content" warnings
6. Everything works on HTTP and HTTPS

**That's it! Your site is live! 🎉**
