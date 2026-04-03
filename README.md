# Credit Web (Udhaar Management) - Offline First

A full-stack **offline-first** udhaar (credit shop) management system.
Frontend stores everything in IndexedDB first, and optionally syncs to a Node/SQLite backend.

## Tech stack
- Frontend: React + Vite + Tailwind CSS
- Local storage: IndexedDB (Dexie)
- Backend: Node.js + Express
- Server DB: SQLite

## Folder structure
```bash
credit-web/
├── package.json
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/Layout.jsx
│       ├── pages/LoginPage.jsx
│       ├── lib/db.js
│       ├── lib/utils.js
│       └── styles/index.css
└── backend/
    ├── package.json
    ├── server.js
    └── data/credit.sqlite (auto-created)
```

## Features implemented
- Username/password login with local session
- Product CRUD basics + CSV import + instant search + unknown barcode quick add
- Customer management with index number, unique id, credit limit, trust level
- Credit flow with scan simulation, duplicate-scan prevention (2 sec), quantity merge, undo last scan
- Payment entry and history-based totals
- Dashboard cards: total credit, recovered, pending, overdue, risky customers
- Reminder WhatsApp links
- JSON export/import backup
- Optional sync button to backend `/api/sync`

## Local run (development)
Run these commands exactly:

```bash
cd /workspace/Credit-web
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Default login:
- username: `admin`
- password: `admin123`

## CSV format for products
Header required:
```csv
name,barcode,price
Soap,8901234567890,35
Milk,8901234567891,28
```

## Build frontend
```bash
cd /workspace/Credit-web
npm run build
```

## Deploy on Ubuntu (Azure VM)
Below are single commands in order.

### 1) Install Node.js 20 + tools
```bash
sudo apt update
sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2) Clone and install app
```bash
git clone <YOUR_REPO_URL> Credit-web
cd Credit-web
npm install
npm run build
```

### 3) Run backend with PM2
```bash
sudo npm install -g pm2
cd /home/azureuser/Credit-web/backend
pm2 start server.js --name credit-backend
pm2 save
pm2 startup systemd -u azureuser --hp /home/azureuser
```

### 4) Serve frontend with Nginx
```bash
sudo apt install -y nginx
sudo rm -rf /var/www/credit-web
sudo mkdir -p /var/www/credit-web
sudo cp -r /home/azureuser/Credit-web/frontend/dist/* /var/www/credit-web/
```

Create Nginx config:
```bash
sudo tee /etc/nginx/sites-available/credit-web >/dev/null <<'CONF'
server {
  listen 80;
  server_name _;

  root /var/www/credit-web;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
CONF
```

Enable site:
```bash
sudo ln -sf /etc/nginx/sites-available/credit-web /etc/nginx/sites-enabled/credit-web
sudo nginx -t
sudo systemctl restart nginx
```

### 5) Open Azure NSG ports
- Allow inbound TCP `80` and optionally `443`.

### 6) Optional HTTPS with Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Production notes
- App works offline first (IndexedDB).
- If backend is down, local app still works and keeps data.
- Use **Sync to server** when internet/server is available.
