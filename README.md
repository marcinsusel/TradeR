# ⚡ TradeR — FIFO & LIFO Portfolio Accounting & Tax Tracking Engine

TradeR is a premium, high-performance web dashboard built with React and Vite designed to parse, track, match, and report transaction histories from brokers (e.g., Interactive Brokers, E\*TRADE). TradeR pairs opening and closing transactions using chronologically strict **FIFO (First-In, First-Out)** or **LIFO (Last-In, First-Out)** accounting rules to compute realized capital gains, isolate open positions, integrate option assignments, and generate ready-to-file tax summaries.

Data privacy is a top priority. All financial data is stored locally in your browser's LocalStorage and can be backed up to your private Google Drive. No data is ever shared with third parties.

---

## ✨ Core Features

### 📊 1. Premium Portfolio Dashboard
* **Dynamic KPIs**: Instant tracking of **Net Realized PnL**, **Win Rate**, **Profit Factor**, and **Open Capital**.
* **Interactive Performance Curve**: A modern, responsive Area Chart (via Recharts) displaying your cumulative realized returns over time.
* **Asset Leaderboards**: Top winning and losing tickers to spotlight your most and least profitable assets at a glance.
* **Ticker Breakdown**: Sortable rankings of realized gain/loss distributions per symbol.

### 🧮 2. Chronological FIFO / LIFO Matching Engine
* **Flexible Accounting**: Toggle dynamically between FIFO and LIFO modes. Recalculations happen instantly across your entire trade history.
* **Option Contracts Support**: Automatic recognition of standard equity options contract tickers (e.g., `AAPL 260529C00150000`) and extraction of contract multipliers ($\times100$) and option expiry dates.
* **Option-Stock Assignment Matching**: Link option contracts (calls/puts) to underlying stock lots. TradeR automatically offsets your stock cost basis or sales proceeds by the option premium received/paid, ensuring strict compliance with IRS cost-basis adjustment guidelines.
* **Holding Period Classification**: Identifies whether a closed lot qualifies as **Short-Term** ($\le 1$ Year) or **Long-Term** ($> 1$ Year) for differential tax treatment.

### 📥 3. Interactive Wizard CSV Importer
* **Intelligent Auto-Detection**: Scans imported CSVs to identify header rows and auto-maps columns (Date, Ticker, Type, Quantity, Price, Fees, Amount) by analyzing aliases.
* **Manual Mapping UI**: An interactive mapper with a real-time CSV data grid preview so you can manually map custom column templates from any broker.
* **Strict Deduplication**: Generates a stable cryptographic fingerprint for every transaction based on its signature. TradeR identifies duplicates and ensures you never import the same file or overlapping periods twice.
* **Review & Confirm Panel**: Audit parsed records before inserting them into your ledger, with filters to isolate new records from duplicate alerts.

### 📁 4. Tax-Ready Capital Gains Reports
* **Flexible Presets**: Generate aggregated reports for Year-to-Date (YTD), This Month, Previous Year, or fully custom date ranges.
* **Differential Tax Tranches**: Real-time breakdown of gains into Short-Term (ordinary income) vs. Long-Term (capital gains) categories.
* **Asset Breakdown**: Summarizes Trade Count, Traded Volume, Accumulated Cost Basis, Accumulated Proceeds, and Net Realized PnL for each symbol.
* **CSV Export**: Instantly download standard-compliant CSV reports containing your aggregated gains for quick import into spreadsheet models or tax software.

### ☁️ 5. Google Drive Integration & Local Backups
* **Direct Drive Sync**: Synchronizes your portfolio data securely with your Google Drive under a dedicated `TradeR/appData.js` database folder. No third-party servers see your financial records.
* **Hybrid Offline Mode**: Operate fully locally in browser storage when offline. Local transactions are automatically merged with cloud copies upon your next sync.
* **Hard Backup Exports**: Export and import standalone JSON database backups to store physical records of your raw transactions ledger.

---

## 🛠️ Architecture & Tech Stack

TradeR is designed as a lightweight, lightning-fast client-only SPA with modern styling tokens:

```
TradeR/
├── csv/                    # Mock/Real csv test templates
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx   # Performance graphs, winners/losers, KPIs
│   │   ├── Importer.jsx    # CSV parsing wizard, mapper, and review tables
│   │   ├── Reports.jsx     # Date filtering, tax summaries, CSV exporter
│   │   ├── Settings.jsx    # Google Drive credentials, FIFO/LIFO, Backup controls
│   │   └── TradesList.jsx  # Completed trades, Open Lots, Audit Log, Option Assignment
│   ├── context/
│   │   └── AppContext.jsx  # Global portfolio state, DB mutators, merge controllers
│   ├── utils/
│   │   ├── csvParser.js    # Delimited-text parser & header detector
│   │   ├── googleDrive.js  # GIS Client, multipart REST uploaders & downloaders
│   │   └── tradeMatcher.js # FIFO/LIFO chronological matching, basis offset formulas
│   ├── App.jsx             # Main navigation frame & Sidebar
│   ├── index.css           # Glassmorphic, neon dark-theme CSS design system
│   └── main.jsx            # React root mounting
├── index.html              # HTML base & Google GIS SDK entry
├── package.json            # Vite configuration and dependencies
└── vite.config.js          # React build configuration
```

* **Core**: React 19 + Vite 6
* **Visual Styling**: Raw modern CSS with fluid gradients, backdrop filters (Glassmorphism), custom responsive grid systems, and animations.
* **Icons**: [Lucide React](https://lucide.dev/)
* **Charts**: [Recharts](https://recharts.org/)
* **Google Identity Services (GIS)**: Direct SDK loading (`https://accounts.google.com/gsi/client`) for secure user-side OAuth token clients.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher is recommended).

### 1. Installation
Clone the repository and install the project dependencies:
```bash
# Clone the repository
git clone https://github.com/yourusername/TradeR.git
cd TradeR

# Install dependencies
npm install
```

### 2. Run the Development Server
Launch Vite's hot-reloading development server locally:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Build
To build and optimize the application for production deployment:
```bash
npm run build
```
The static bundles will be written to the `dist/` directory, ready to be hosted on Netlify, Vercel, GitHub Pages, or any static provider.

---

## 🔒 Setting Up Google Drive Cloud Sync

TradeR stores financial logs locally in your browser by default. To unlock cross-device synchronization via your personal **Google Drive** without sharing data with outside servers, you can set up a secure OAuth credential:

1. **Create a Google Cloud Project**:
   * Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
   * Click **New Project** and name it `TradeR`.

2. **Enable the Google Drive API**:
   * Search for the **Google Drive API** in the API Library and click **Enable**.

3. **Configure the OAuth Consent Screen**:
   * Navigate to the **OAuth Consent Screen** section. Select **External** user type.
   * Provide application support emails and fill out developer information.
   * Add the following narrow permission scope:
     `https://www.googleapis.com/auth/drive.file` (This grants TradeR access *only* to files that it creates or opens itself, keeping your wider Drive private).
   * **Crucial**: Add your Google Account email as a **Test User** while the app remains in "Testing" mode.

4. **Generate Credentials (Client ID)**:
   * Go to the **Credentials** tab, click **Create Credentials**, and select **OAuth client ID**.
   * Under Application Type, select **Web Application**.
   * In **Authorized JavaScript origins**, add your development and production URLs:
     * `http://localhost:5173` (Vite dev server default)
     * `http://localhost:3000` (Alternative local ports)
     * Your production hosting URL (e.g., `https://your-trader-app.netlify.app`)
   * Click **Create** to receive your Client ID string (e.g. `123456789-abc.apps.googleusercontent.com`).

5. **Initialize Connection**:
   * Open the **Settings** tab inside TradeR.
   * Paste your Client ID in the input box and click **Save Client ID**.
   * Click **Sign In with Google** to authenticate. A folder named `TradeR` containing `appData.js` will automatically be created on your Google Drive to store your encrypted trading ledger.

---

## 📖 Guided Walkthrough

### 📥 Importing Data
1. Export a transaction history report from your broker (e.g., Interactive Brokers Trades/Transactions Activity report or E\*TRADE Gains & Losses spreadsheet) as a `.csv` file.
2. Select the **Import CSV** tab in TradeR.
3. Drag & drop your `.csv` file into the active area.
4. If TradeR recognizes the format, it skips straight to the **Review & Confirm** screen. If it doesn't recognize the columns, it provides a manual mapper. Choose the row representing the column headers, map the respective columns to standard fields, and click **Process**.
5. Filter or select the records you want to ingest and click **Import Selected**. Duplicates are highlighted and skipped automatically.

### 🖇️ Linking Option Assignments (Stock Basis Offsets)
1. Go to the **Trade History** tab and select the **Open Positions** view.
2. If you hold options contracts that were assigned (leading to stock purchases/sales), check both the **options contract position** and the **underlying stock position** in the list.
3. Click the **Assign Selected** action bar that appears at the bottom.
4. Select the option lot(s) and stock lot(s) you wish to link, and click **Confirm Assignment**.
5. TradeR will automatically adjust the stock's realized capital gain calculations based on the linked option premium received/paid when that stock position is closed.

### 📝 Generating Tax Reports
1. Navigate to the **Tax Reports** tab.
2. Toggle your desired date preset (e.g., YTD or Previous Year) or choose a custom calendar range.
3. TradeR immediately breaks down your transactions into **Short-Term** vs. **Long-Term** gains based on matching dates.
4. Use the symbol filter to investigate specific assets, or click **Export Report** to download an aggregated spreadsheet that can be uploaded into commercial tax returns.

---

## 🛡️ License

This project is open-source and available under the [MIT License](LICENSE). All data parsing, calculations, and connections run completely client-side in your own browser, protecting your financial privacy.
