# 🚀 KKTC 2025 Seçim Uygulaması - Vercel Deployment Rehberi

## 📋 Ön Hazırlık

### 1. Supabase Kurulumu

1. [Supabase](https://supabase.com) hesabı oluşturun
2. Yeni proje oluşturun
3. `supabase-setup.sql` dosyasını SQL Editor'da çalıştırın
4. Project Settings > API'den URL ve Anon Key'i alın

### 2. GitHub Repository

✅ Repository hazır: `https://github.com/RYucel/CumhurSecim_v2.git`

## 🔧 Vercel Deployment Adımları

### 1. Vercel Hesabı ve Proje Oluşturma

1. [Vercel](https://vercel.com) hesabı oluşturun
2. "New Project" butonuna tıklayın
3. GitHub repository'yi seçin: `RYucel/CumhurSecim_v2`
4. Import butonuna tıklayın

### 2. Environment Variables Ayarlama

Vercel dashboard'da **Settings > Environment Variables** bölümünden şu değişkenleri ekleyin:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Server Configuration
NODE_ENV=production
PORT=3000
TEST_MODE=false

# Security Configuration
ADMIN_KEY=your-super-secure-admin-key-min-20-chars
SESSION_SECRET=your-super-secure-session-secret-min-32-chars
```

### 3. Build Settings

Vercel otomatik olarak `vercel.json` dosyasını algılayacak. Eğer manuel ayar gerekirse:

- **Framework Preset**: Other
- **Build Command**: `npm install`
- **Output Directory**: (boş bırakın)
- **Install Command**: `npm install`

### 4. Domain Ayarlama

Vercel size otomatik bir domain verecek (örn: `cumhur-secim-v2.vercel.app`)
Özel domain kullanmak isterseniz:

1. Settings > Domains
2. Custom domain ekleyin
3. DNS ayarlarını yapın

## 🔒 Güvenlik Kontrolleri

### Deployment Sonrası Kontrol Listesi

- [ ] Supabase RLS politikaları aktif
- [ ] Environment variables doğru ayarlanmış
- [ ] Admin panel sadece doğru key ile erişilebilir
- [ ] Rate limiting çalışıyor (2 oy/dakika)
- [ ] CSP headers aktif
- [ ] HTTPS zorunlu
- [ ] Seçim zamanı kontrolü aktif (production'da)

### Test Adımları

1. **Ana sayfa testi**: `https://your-domain.vercel.app`
2. **Admin panel testi**: `https://your-domain.vercel.app/admin.html`
3. **API testi**: Oy verme işlemini test edin
4. **Rate limiting testi**: Hızlı oy vermeyi deneyin
5. **Güvenlik testi**: Yanlış admin key ile erişim deneyin

## 📊 Monitoring ve Logs

### Vercel Dashboard

- **Functions**: Sunucu loglarını görüntüleyin
- **Analytics**: Trafik istatistiklerini takip edin
- **Speed Insights**: Performans metrikleri

### Supabase Dashboard

- **Table Editor**: Oy verilerini görüntüleyin
- **SQL Editor**: Özel sorgular çalıştırın
- **Logs**: Database işlemlerini takip edin

## 🚨 Acil Durum Prosedürleri

### Uygulamayı Durdurma

1. Vercel Dashboard > Settings > Functions
2. "Pause Deployments" seçeneğini aktifleştirin

### Veritabanını Sıfırlama

```sql
-- Supabase SQL Editor'da çalıştırın
DELETE FROM votes;
DELETE FROM vote_logs;
```

### Acil Güvenlik Önlemleri

1. Supabase'de RLS'yi devre dışı bırakın
2. Environment variables'ı değiştirin
3. Yeni deployment yapın

## 📞 Destek

### Hata Durumunda

1. Vercel Functions loglarını kontrol edin
2. Supabase logs'ları kontrol edin
3. Browser console'da hata mesajlarını kontrol edin
4. Network tab'da API çağrılarını kontrol edin

### Performans Sorunları

1. Vercel Analytics'i kontrol edin
2. Supabase Query Performance'ı kontrol edin
3. CDN cache ayarlarını kontrol edin

## 🎯 Production Checklist

### Seçim Günü Öncesi

- [ ] Tüm testler başarılı
- [ ] Backup planı hazır
- [ ] Monitoring aktif
- [ ] Seçim zamanı trigger'ı aktif
- [ ] Rate limiting ayarları doğru
- [ ] Admin panel erişimi test edildi

### Seçim Günü

- [ ] Sistem 08:00'da aktif
- [ ] Real-time monitoring
- [ ] Acil müdahale ekibi hazır
- [ ] Backup sistemler hazır

### Seçim Sonrası

- [ ] Sonuçlar yedeklendi
- [ ] Sistem güvenli şekilde kapatıldı
- [ ] Loglar arşivlendi
- [ ] Güvenlik raporu hazırlandı

---

**🔐 Güvenlik Uyarısı**: Production environment'da mutlaka güçlü şifreler kullanın ve tüm güvenlik önlemlerini aktifleştirin.

**📧 İletişim**: Teknik destek için repository issues bölümünü kullanın.