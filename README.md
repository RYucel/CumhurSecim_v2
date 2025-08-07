# 🗳️ KKTC Cumhurbaşkanlığı Seçimi Oylama Uygulaması

KKTC Cumhurbaşkanlığı seçimi için geliştirilmiş **güvenli** ve **şeffaf** oylama uygulaması.

## ✨ Özellikler

### 🔒 Güvenlik
- **Rate Limiting**: Dakikada maksimum 2 oy verme denemesi
- **Fingerprint Tabanlı Koruma**: Cihaz bazında tekrar oy verme engelleme
- **IP Bazlı Koruma**: Her IP adresinden sadece bir oy kabul edilir
- **Duplicate Oy Engelleme**: Aynı cihaz/IP'den birden fazla oy verme engellenir
- **VPN/Proxy Tespiti**: VPN ve proxy kullanımı engellenir
- **Input Sanitization**: XSS saldırılarına karşı koruma
- **CSP Headers**: Content Security Policy ile güvenlik
- **HTTPS Zorunluluğu**: Güvenli veri iletimi
- **Admin Panel Güvenliği**: Güçlü authentication

### 📊 Fonksiyonellik
- **Gerçek Zamanlı Sonuçlar**: Anlık oy sayımı
- **Responsive Tasarım**: Tüm cihazlarda uyumlu
- **Seçim Zamanı Kontrolü**: Belirlenen saatlerde oy verme
- **Detaylı Loglama**: Tüm aktivitelerin izlenmesi
- **Demo Modu**: Test için Supabase'siz çalışma

## 🚀 Hızlı Başlangıç

### 1. Projeyi Klonlayın
```bash
git clone <repository-url>
cd Cumhur_v1
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Environment Variables Ayarlayın
```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
ADMIN_KEY=your_secure_admin_key_20_chars_min
SESSION_SECRET=your_secure_session_secret_32_chars_min
NODE_ENV=development
TEST_MODE=true
```

### 4. Uygulamayı Başlatın
```bash
# Development modu
npm run dev

# Production modu
npm start
```

## 🌐 Deployment (Vercel)

### Ön Hazırlık
1. **Güvenlik Checklist'ini** tamamlayın ([SECURITY.md](./SECURITY.md))
2. **Environment variables'ları** production değerleriyle ayarlayın
3. **Supabase RLS politikalarını** aktifleştirin

### Vercel'e Deploy
```bash
# Vercel CLI ile
npm i -g vercel
vercel

# Veya GitHub integration ile
# 1. GitHub'a push edin
# 2. Vercel'de import edin
# 3. Environment variables'ları ayarlayın
```

### Vercel Environment Variables
```
SUPABASE_URL=your_production_supabase_url
SUPABASE_ANON_KEY=your_production_supabase_anon_key
ADMIN_KEY=your_secure_admin_key_20_chars_min
SESSION_SECRET=your_secure_session_secret_32_chars_min
NODE_ENV=production
TEST_MODE=false
```

## 🛠️ Kullanım

- **Ana Sayfa**: `https://your-app.vercel.app`
- **Admin Panel**: `https://your-app.vercel.app/admin.html`
- **API Status**: `https://your-app.vercel.app/api/status`

## 🔧 Teknolojiler

- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla JavaScript, CSS3
- **Security**: Helmet.js, Rate Limiting, CSP
- **Deployment**: Vercel
- **Monitoring**: Built-in logging system

## 📋 Scripts

```bash
npm run dev          # Development server
npm start            # Production server
npm run security-audit  # Güvenlik taraması
npm run security-fix    # Güvenlik açıklarını düzelt
```

## 🔐 Güvenlik

Detaylı güvenlik bilgileri için [SECURITY.md](./SECURITY.md) dosyasını inceleyin.

## 📋 Gereksinimler

- Node.js (v16 veya üzeri)
- npm veya yarn
- Supabase hesabı

### 3. Supabase Kurulumu

1. [Supabase](https://supabase.com) hesabı oluşturun
2. Yeni bir proje oluşturun
3. SQL Editor'da aşağıdaki tabloyu oluşturun:

```sql
-- Oylar tablosu
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    candidate VARCHAR(50) NOT NULL,
    fingerprint VARCHAR(100) NOT NULL UNIQUE,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index'ler
CREATE INDEX idx_votes_candidate ON votes(candidate);
CREATE INDEX idx_votes_fingerprint ON votes(fingerprint);
CREATE INDEX idx_votes_created_at ON votes(created_at);

-- RLS (Row Level Security) politikaları
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "Anyone can read votes" ON votes
    FOR SELECT USING (true);

-- Sadece yeni oy eklenebilir
CREATE POLICY "Anyone can insert votes" ON votes
    FOR INSERT WITH CHECK (true);

-- Güncelleme ve silme yasak
CREATE POLICY "No updates allowed" ON votes
    FOR UPDATE USING (false);

CREATE POLICY "No deletes allowed" ON votes
    FOR DELETE USING (false);
```

### 4. Çevre Değişkenlerini Ayarlayın

`.env` dosyasını düzenleyin:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000
```

### 5. Uygulamayı Başlatın

```bash
# Geliştirme modu
npm run dev

# Veya production modu
npm start
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

## 🎯 Kullanım

1. **Oylama**: Ana sayfada bir aday seçin ve "OYUMU KULLAN" butonuna tıklayın
2. **Güvenlik**: Güvenlik önlemleri hakkında bilgi alın
3. **Bilgilendirme**: Uygulama hakkında detaylı bilgi edinin

## 🔒 Güvenlik Özellikleri

- **Fingerprinting**: Cihaz bazlı tekil kimlik
- **Rate Limiting**: Dakikada 5 oy, 15 dakikada 100 istek
- **IP Tracking**: Şüpheli aktivite tespiti
- **RLS Policies**: Veritabanı seviyesinde güvenlik
- **CORS Protection**: Cross-origin güvenliği
- **Helmet.js**: HTTP güvenlik başlıkları

## 📊 API Endpoints

### POST /api/vote
Yeni oy kaydet
```json
{
  "candidate": "ersin-tatar",
  "fingerprint": "unique_device_id"
}
```

### GET /api/results
Oy sonuçlarını getir
```json
{
  "votes": {
    "ersin-tatar": 150,
    "tufan-erhurman": 120,
    "mehmet-hasguler": 80,
    "total": 350
  },
  "percentages": {
    "ersin-tatar": "42.9",
    "tufan-erhurman": "34.3",
    "mehmet-hasguler": "22.9"
  }
}
```

## 🎨 Adaylar

1. **Ersin Tatar** (UBP) - Mevcut Cumhurbaşkanı
2. **Tufan Erhürman** (CTP) - CTP Genel Başkanı
3. **Mehmet Hasgüler** (BKP) - BKP Genel Başkanı

## 📅 Seçim Tarihi

**19 Ekim 2025** - Pazar

## ⚠️ Önemli Uyarılar

- Bu uygulama **eğlence amaçlıdır**
- **Resmi seçim sonuçlarını etkilemez**
- Gerçek oy vermeyi unutmayın!

## 🛠️ Geliştirme

### Proje Yapısı
```
Cumhur_v1/
├── public/
│   ├── index.html      # Ana sayfa
│   ├── styles.css      # CSS stilleri
│   └── script.js       # JavaScript kodu
├── server.js           # Express sunucu
├── package.json        # Bağımlılıklar
├── .env               # Çevre değişkenleri
├── .gitignore         # Git ignore
└── README.md          # Bu dosya
```

### Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

MIT License - Detaylar için `LICENSE` dosyasına bakın.

## 🤝 Destek

Sorularınız için issue açabilir veya iletişime geçebilirsiniz.

---

**Not**: Bu proje eğitim ve eğlence amaçlıdır. Gerçek seçimlerde resmi kanalları kullanın! 🇹🇷🇨🇾