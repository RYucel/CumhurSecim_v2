# Güvenlik Rehberi

## 🔒 Güvenlik Özellikleri

### Uygulanan Güvenlik Önlemleri

1. **Rate Limiting**
   - Oy verme: Dakikada maksimum 2 deneme
   - Genel API: 15 dakikada maksimum 100 istek
   - IP + User-Agent kombinasyonu ile tracking

2. **Input Validation & Sanitization**
   - Tüm kullanıcı girdileri sanitize edilir
   - XSS saldırılarına karşı koruma
   - Request boyutu sınırlaması (1KB)

3. **Content Security Policy (CSP)**
   - Strict CSP headers
   - Inline script'ler engellendi
   - XSS saldırılarına karşı koruma

4. **Helmet.js Security Headers**
   - HSTS (HTTP Strict Transport Security)
   - X-Frame-Options
   - X-Content-Type-Options
   - Referrer-Policy

5. **Authentication & Authorization**
   - Admin panel için güvenli key sistemi
   - Minimum 20 karakter admin key zorunluluğu

6. **Logging & Monitoring**
   - Tüm oy verme denemeleri loglanır
   - Başarısız denemeler izlenir
   - IP ve fingerprint tracking

## 🚀 Production Deployment Checklist

### Zorunlu Güvenlik Adımları

- [ ] `.env` dosyasındaki tüm placeholder değerleri değiştirin
- [ ] `ADMIN_KEY` için güvenli bir anahtar oluşturun (min 20 karakter)
- [ ] `SESSION_SECRET` için güvenli bir secret oluşturun (min 32 karakter)
- [ ] `NODE_ENV=production` ayarlayın
- [ ] `TEST_MODE=false` ayarlayın
- [ ] Supabase RLS (Row Level Security) politikalarını aktifleştirin
- [ ] HTTPS kullanın (Vercel otomatik sağlar)
- [ ] Domain whitelist'i ayarlayın

### Environment Variables (Vercel)

```
SUPABASE_URL=your_actual_supabase_url
SUPABASE_ANON_KEY=your_actual_supabase_anon_key
ADMIN_KEY=your_secure_admin_key_20_chars_min
SESSION_SECRET=your_secure_session_secret_32_chars_min
NODE_ENV=production
TEST_MODE=false
PORT=3001
```

## 🛡️ Supabase Güvenlik Ayarları

### Row Level Security (RLS) Politikaları

```sql
-- votes tablosu için RLS politikaları
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Sadece INSERT izni (oy verme)
CREATE POLICY "Allow vote insertion" ON votes
  FOR INSERT WITH CHECK (true);

-- Sadece SELECT izni (sonuçları okuma)
CREATE POLICY "Allow vote reading" ON votes
  FOR SELECT USING (true);

-- vote_logs tablosu için RLS
ALTER TABLE vote_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow log insertion" ON vote_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow log reading" ON vote_logs
  FOR SELECT USING (true);
```

## ⚠️ Güvenlik Uyarıları

1. **Asla şunları yapmayın:**
   - `.env` dosyasını Git'e yüklemeyin
   - Admin key'i kodda hardcode etmeyin
   - Production'da `TEST_MODE=true` bırakmayın
   - Zayıf admin key'leri kullanmayın

2. **Düzenli kontroller:**
   - Admin panel loglarını kontrol edin
   - Anormal oy verme patternlerini izleyin
   - Rate limiting'in çalıştığını doğrulayın

3. **Incident Response:**
   - Şüpheli aktivite durumunda admin panel'den logları inceleyin
   - Gerekirse rate limit'leri daha sıkı hale getirin
   - Supabase dashboard'dan database aktivitesini izleyin

## 📞 Güvenlik İletişimi

Güvenlik açığı tespit ederseniz, lütfen sorumlu şekilde bildirin.

---

**Not:** Bu uygulama demokratik seçim sürecinin bir parçasıdır. Güvenlik önlemlerine uyarak seçim bütünlüğünü koruyalım.