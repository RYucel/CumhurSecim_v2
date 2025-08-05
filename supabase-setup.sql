-- KKTC Seçim Uygulaması - Supabase Güvenlik Kurulumu
-- Bu script'i Supabase SQL Editor'da çalıştırın

-- 1. Votes tablosu oluştur
CREATE TABLE IF NOT EXISTS votes (
    id BIGSERIAL PRIMARY KEY,
    candidate TEXT NOT NULL CHECK (candidate IN ('ersin-tatar', 'tufan-erhurman', 'mehmet-hasguler')),
    fingerprint TEXT NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vote logs tablosu oluştur
CREATE TABLE IF NOT EXISTS vote_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET NOT NULL,
    fingerprint TEXT NOT NULL,
    candidate TEXT,
    success BOOLEAN NOT NULL,
    reason TEXT
);

-- 3. Unique constraints ekle
ALTER TABLE votes ADD CONSTRAINT unique_fingerprint UNIQUE (fingerprint);
CREATE INDEX IF NOT EXISTS idx_votes_ip_address ON votes (ip_address);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes (created_at);
CREATE INDEX IF NOT EXISTS idx_vote_logs_timestamp ON vote_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_vote_logs_ip_address ON vote_logs (ip_address);

-- 4. Row Level Security (RLS) aktifleştir
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Politikaları oluştur

-- Votes tablosu için politikalar
CREATE POLICY "Allow vote insertion" ON votes
    FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Allow vote reading" ON votes
    FOR SELECT 
    USING (true);

-- Vote logs tablosu için politikalar
CREATE POLICY "Allow log insertion" ON vote_logs
    FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Allow log reading" ON vote_logs
    FOR SELECT 
    USING (true);

-- 6. Güvenlik fonksiyonları

-- IP başına maksimum oy sayısını kontrol eden fonksiyon
CREATE OR REPLACE FUNCTION check_ip_vote_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM votes WHERE ip_address = NEW.ip_address) >= 3 THEN
        RAISE EXCEPTION 'Bu IP adresinden çok fazla oy kullanılmış';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger oluştur
DROP TRIGGER IF EXISTS check_ip_limit_trigger ON votes;
CREATE TRIGGER check_ip_limit_trigger
    BEFORE INSERT ON votes
    FOR EACH ROW
    EXECUTE FUNCTION check_ip_vote_limit();

-- 7. Seçim zamanı kontrolü fonksiyonu
CREATE OR REPLACE FUNCTION check_election_time()
RETURNS TRIGGER AS $$
BEGIN
    -- KKTC Seçim Zamanı: 19 Ocak 2025, 08:00-18:00 (UTC+3)
    IF NOW() AT TIME ZONE 'Europe/Istanbul' < '2025-01-19 08:00:00'::timestamp 
       OR NOW() AT TIME ZONE 'Europe/Istanbul' > '2025-01-19 18:00:00'::timestamp THEN
        RAISE EXCEPTION 'Oy verme saatleri: 19 Ocak 2025, 08:00-18:00 arası';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seçim zamanı trigger'ı (production'da aktifleştirin)
-- DROP TRIGGER IF EXISTS check_election_time_trigger ON votes;
-- CREATE TRIGGER check_election_time_trigger
--     BEFORE INSERT ON votes
--     FOR EACH ROW
--     EXECUTE FUNCTION check_election_time();

-- 8. Sonuçları görüntülemek için view oluştur
CREATE OR REPLACE VIEW election_results AS
SELECT 
    candidate,
    COUNT(*) as vote_count,
    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM votes)), 2) as percentage
FROM votes 
GROUP BY candidate
ORDER BY vote_count DESC;

-- 9. İstatistikler için view
CREATE OR REPLACE VIEW election_stats AS
SELECT 
    (SELECT COUNT(*) FROM votes) as total_votes,
    (SELECT COUNT(DISTINCT ip_address) FROM votes) as unique_ips,
    (SELECT COUNT(DISTINCT fingerprint) FROM votes) as unique_fingerprints,
    (SELECT COUNT(*) FROM vote_logs WHERE success = true) as successful_attempts,
    (SELECT COUNT(*) FROM vote_logs WHERE success = false) as failed_attempts;

-- 10. Güvenlik notları
/*
GÜVENLİK KURULUM NOTLARI:

1. Bu script'i Supabase SQL Editor'da çalıştırın
2. RLS politikalarının aktif olduğunu doğrulayın
3. Production'da seçim zamanı trigger'ını aktifleştirin
4. Anon key'in sadece gerekli işlemleri yapabildiğini kontrol edin
5. Supabase Dashboard'dan tablo izinlerini kontrol edin

VERCEL ENVIRONMENT VARIABLES:
- SUPABASE_URL: Supabase project URL'niz
- SUPABASE_ANON_KEY: Supabase anon key'iniz
- ADMIN_KEY: Güvenli admin anahtarı (min 20 karakter)
- SESSION_SECRET: Güvenli session secret (min 32 karakter)
- NODE_ENV: production
- TEST_MODE: false

SUPABASE GÜVENLİK AYARLARI:
1. Authentication > Settings > Enable email confirmations
2. Database > Settings > Enable Row Level Security
3. API > Settings > Enable realtime for tables
4. Storage > Policies > Restrict file uploads
*/