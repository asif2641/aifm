# Smart Bill Auditor & Expense Suite — Customer Deployment & Handover Guide

## 1. Product Introduction
**Smart Bill Auditor & Expense Suite** is an offline-capable, privacy-first business ledger, receipt auditor, and point-of-sale platform. Designed for small-to-medium businesses, retail shops, wholesale merchants, contractors, and household managers, it combines military-grade local data isolation with intelligent automated receipt auditing.

---

## 2. Deployment Options

### Option A: 100% Offline Local Desktop (Zero-Install)
You do not need an internet connection or web hosting to run the application.
1. Download or copy the project folder (`aifm`) onto your computer, external SSD, or USB drive.
2. Double-click **`start.bat`** (or open **`index.html`** in any web browser such as Chrome, Edge, Firefox, or Safari).
3. The application loads immediately via the `file:///` protocol. All your data is securely stored inside your browser's private local IndexedDB vault.

---

### Option B: 5-Step Free Cloud Hosting (With Free SSL & Custom Domain)
If you wish to access your application securely across multiple devices (phone, laptop, iPad) over the web, you can host it for free in less than 5 minutes on **Netlify**, **GitHub Pages**, or **Cloudflare Pages**.

#### Method 1: Netlify Drop (Easiest — No Git required)
1. Visit [https://app.netlify.com/drop](https://app.netlify.com/drop) and sign in with a free account.
2. Drag and drop the complete `aifm` folder onto the Netlify upload target.
3. Within 10 seconds, Netlify generates a permanent HTTPS link (e.g. `https://my-smart-auditor.netlify.app`).
4. (Optional) Go to **Site settings > Domain management** to connect your own custom domain (e.g., `portal.mybusiness.com`). Netlify provisions a free SSL certificate automatically.
5. In your mobile browser, open your URL and tap **Add to Home Screen** to install it as an offline PWA app.

#### Method 2: GitHub Pages
1. Create a free repository on [GitHub](https://github.com) named `bill-auditor`.
2. Push or upload the project files to the `main` branch.
3. Open **Settings > Pages**.
4. Under **Branch**, select `main` / `(root)` and click **Save**.
5. Your application will be live at `https://<your-username>.github.io/bill-auditor/`.

---

## 3. Privacy Architecture & Bring Your Own Key (BYOK)
Smart Bill Auditor is engineered on the principle of **Zero Cloud Leakage**:
- **Local Storage by Default**: 100% of your transactions, bills, party ledgers, customer profiles, and audit records reside in your browser's local IndexedDB database. We operate no remote backend servers, and we never collect telemetry.
- **Optional AI Scanning (BYOK)**: If you choose to enable automated AI receipt scanning, you provide your own free Google Gemini API key.
  - To get a free key: Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey), log in with any Google account, and generate an API key.
  - Enter the key into **Settings > AI Configuration**.
  - Your API key is saved exclusively in your browser's encrypted local storage and sent only to Google's official Gemini endpoint. It is never transmitted anywhere else.
- **Fast File & Photo Scanning**: Upload any invoice image or multi-page PDF, or use the camera to capture receipts directly.

---

## 4. Backup, Restore & Data Portability
Because your database lives in your browser, regular backups ensure you never lose your records even if you format your computer or switch devices.

### How to Create a Backup
1. Go to **Settings > Data Management & Backup**.
2. Click **Create Full Backup (.JSON)**.
3. Save the resulting timestamped file (e.g., `smart-bill-backup-2026-11-04.json`) to a safe location (USB drive, OneDrive, or Google Drive).

### How to Restore a Backup
1. On any device, open the application.
2. Go to **Settings > Data Management & Backup**.
3. Under **Restore Backup**, choose either:
   - **Merge & Update**: Adds missing records without deleting your existing entries.
   - **Full Replace**: Replaces the entire local database with the backup archive.
4. Select your backup file and confirm. The restore completes in under two seconds.

---

## 5. Secret Seller & Demonstration Panel
The application includes a built-in seller demonstration panel for business owners and resellers:
- **Shortcut**: Press **`Alt + Shift + D`** anywhere in the application (or click the subtle demo pill in the bottom status bar).
- **Capabilities**:
  - **Load 50 Demo Transactions**: Injects a complete retail/wholesale business scenario (8 suppliers, 6 customers, 15 inventory items, and 50 realistic purchase & sales bills).
  - **Clean Demo Reset**: Automatically purges all demo transactions in one click with zero balance drift, leaving genuine user data 100% intact.
  - **Launch Interactive Tour**: Starts the 9-step guided walkthrough highlighting key features.
  - **Build Mode Switch**: Switch between `demo` mode (with sample banners) and `customer` mode (clean production).

---

## 6. Regulatory & Financial Disclaimer
> **IMPORTANT NOTICE**:
> Smart Bill Auditor & Expense Suite is an operational software utility designed to assist users with record keeping, visual bill auditing, discrepancy detection, and internal reconciliations.
> 
> The software does not provide certified financial, legal, or statutory tax advice. Calculations, tax estimates, and audit findings should be verified by a certified accountant before filing official tax returns or executing statutory compliance submissions. The developers assume no liability for accounting discrepancies, hardware failures, or unbacked-up data loss.
