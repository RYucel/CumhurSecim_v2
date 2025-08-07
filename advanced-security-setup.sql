-- KKTC Seçim Uygulaması - Gelişmiş Güvenlik Sistemi
-- Bu script'i Supabase SQL Editor'da çalıştırın

-- 1. UsedFingerprints tablosu oluştur
CREATE TABLE IF NOT EXISTS used_fingerprints (
    id BIGSERIAL PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    ip_address INET NOT NULL,
    user_agent TEXT,
    candidate TEXT NOT NULL,
    vote_timestamp TIMESTAMPTZ DEFAULT NOW(),
    is_suspicious BOOLEAN DEFAULT FALSE,
    suspicious_reason TEXT
);

-- 2. IP Rate Limiting tablosu oluştur
CREATE TABLE IF NOT EXISTS ip_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    fingerprint TEXT NOT NULL,
    attempt_timestamp TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    block_reason TEXT
);

-- 3. Suspicious Activities tablosu oluştur
CREATE TABLE IF NOT EXISTS suspicious_activities (
    id BIGSERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    fingerprint TEXT NOT NULL,
    activity_type TEXT NOT NULL, -- 'multiple_fingerprints', 'rapid_attempts', 'ip_correlation'
    details JSONB,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    severity INTEGER DEFAULT 1 -- 1: Low, 2: Medium, 3: High, 4: Critical
);

-- 4. İndeksler oluştur
CREATE INDEX IF NOT EXISTS idx_used_fingerprints_fingerprint ON used_fingerprints (fingerprint);
CREATE INDEX IF NOT EXISTS idx_used_fingerprints_ip_address ON used_fingerprints (ip_address);
CREATE INDEX IF NOT EXISTS idx_used_fingerprints_timestamp ON used_fingerprints (vote_timestamp);
CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_ip_address ON ip_rate_limits (ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_timestamp ON ip_rate_limits (attempt_timestamp);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_ip ON suspicious_activities (ip_address);
CREATE INDEX IF NOT EXISTS idx_suspicious_activities_timestamp ON suspicious_activities (detected_at);

-- 5. RLS aktifleştir
ALTER TABLE used_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;

-- 6. RLS Politikaları
CREATE POLICY "Allow fingerprint operations" ON used_fingerprints
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow rate limit operations" ON ip_rate_limits
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow suspicious activity operations" ON suspicious_activities
    FOR ALL USING (true) WITH CHECK (true);

-- 7. Gelişmiş güvenlik fonksiyonları

-- Fingerprint kontrolü fonksiyonu
CREATE OR REPLACE FUNCTION check_fingerprint_used(p_fingerprint TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM used_fingerprints 
        WHERE fingerprint = p_fingerprint
    );
END;
$$ LANGUAGE plpgsql;

-- IP Rate Limiting kontrolü fonksiyonu
CREATE OR REPLACE FUNCTION check_ip_rate_limit(p_ip_address INET)
RETURNS JSONB AS $$
DECLARE
    recent_attempts INTEGER;
    unique_fingerprints INTEGER;
    result JSONB;
BEGIN
    -- Son 1 saat içindeki deneme sayısı
    SELECT COUNT(*) INTO recent_attempts
    FROM ip_rate_limits 
    WHERE ip_address = p_ip_address 
    AND attempt_timestamp > NOW() - INTERVAL '1 hour';
    
    -- Son 1 saat içindeki benzersiz fingerprint sayısı
    SELECT COUNT(DISTINCT fingerprint) INTO unique_fingerprints
    FROM ip_rate_limits 
    WHERE ip_address = p_ip_address 
    AND attempt_timestamp > NOW() - INTERVAL '1 hour';
    
    result := jsonb_build_object(
        'is_blocked', CASE WHEN unique_fingerprints > 5 THEN true ELSE false END,
        'recent_attempts', recent_attempts,
        'unique_fingerprints', unique_fingerprints,
        'reason', CASE 
            WHEN unique_fingerprints > 5 THEN 'Too many different fingerprints from same IP'
            ELSE 'OK'
        END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Korelasyon analizi fonksiyonu
CREATE OR REPLACE FUNCTION analyze_ip_fingerprint_correlation(p_ip_address INET, p_fingerprint TEXT)
RETURNS JSONB AS $$
DECLARE
    ip_fingerprint_count INTEGER;
    fingerprint_ip_count INTEGER;
    result JSONB;
BEGIN
    -- Bu IP adresinden kaç farklı fingerprint kullanılmış
    SELECT COUNT(DISTINCT fingerprint) INTO ip_fingerprint_count
    FROM used_fingerprints 
    WHERE ip_address = p_ip_address;
    
    -- Bu fingerprint kaç farklı IP adresinden kullanılmış
    SELECT COUNT(DISTINCT ip_address) INTO fingerprint_ip_count
    FROM used_fingerprints 
    WHERE fingerprint = p_fingerprint;
    
    result := jsonb_build_object(
        'is_suspicious', CASE 
            WHEN ip_fingerprint_count > 3 OR fingerprint_ip_count > 2 THEN true 
            ELSE false 
        END,
        'ip_fingerprint_count', ip_fingerprint_count,
        'fingerprint_ip_count', fingerprint_ip_count,
        'risk_level', CASE 
            WHEN ip_fingerprint_count > 5 OR fingerprint_ip_count > 3 THEN 'HIGH'
            WHEN ip_fingerprint_count > 3 OR fingerprint_ip_count > 2 THEN 'MEDIUM'
            ELSE 'LOW'
        END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Şüpheli aktivite kaydetme fonksiyonu
CREATE OR REPLACE FUNCTION log_suspicious_activity(
    p_ip_address INET,
    p_fingerprint TEXT,
    p_activity_type TEXT,
    p_details JSONB,
    p_severity INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO suspicious_activities (
        ip_address, fingerprint, activity_type, details, severity
    ) VALUES (
        p_ip_address, p_fingerprint, p_activity_type, p_details, p_severity
    );
END;
$$ LANGUAGE plpgsql;

-- Oy kaydetme fonksiyonu (gelişmiş güvenlik ile)
CREATE OR REPLACE FUNCTION secure_vote_insert(
    p_candidate TEXT,
    p_fingerprint TEXT,
    p_ip_address INET,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    fingerprint_check BOOLEAN;
    rate_limit_result JSONB;
    correlation_result JSONB;
    final_result JSONB;
BEGIN
    -- 1. Fingerprint kontrolü
    fingerprint_check := check_fingerprint_used(p_fingerprint);
    
    IF fingerprint_check THEN
        -- Rate limit kaydı ekle
        INSERT INTO ip_rate_limits (ip_address, fingerprint, success, block_reason)
        VALUES (p_ip_address, p_fingerprint, false, 'Fingerprint already used');
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Bu cihazdan zaten oy kullanılmış',
            'error_code', 'FINGERPRINT_USED'
        );
    END IF;
    
    -- 2. IP Rate Limiting kontrolü
    rate_limit_result := check_ip_rate_limit(p_ip_address);
    
    IF (rate_limit_result->>'is_blocked')::boolean THEN
        -- Rate limit kaydı ekle
        INSERT INTO ip_rate_limits (ip_address, fingerprint, success, block_reason)
        VALUES (p_ip_address, p_fingerprint, false, rate_limit_result->>'reason');
        
        -- Şüpheli aktivite kaydet
        PERFORM log_suspicious_activity(
            p_ip_address, p_fingerprint, 'rate_limit_exceeded', rate_limit_result, 3
        );
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Bu IP adresinden çok fazla deneme yapılmış. Lütfen daha sonra tekrar deneyin.',
            'error_code', 'RATE_LIMIT_EXCEEDED',
            'details', rate_limit_result
        );
    END IF;
    
    -- 3. Korelasyon analizi
    correlation_result := analyze_ip_fingerprint_correlation(p_ip_address, p_fingerprint);
    
    IF (correlation_result->>'is_suspicious')::boolean THEN
        -- Şüpheli aktivite kaydet
        PERFORM log_suspicious_activity(
            p_ip_address, p_fingerprint, 'ip_correlation', correlation_result, 2
        );
    END IF;
    
    -- 4. Oy kaydet
    BEGIN
        -- Votes tablosuna ekle
        INSERT INTO votes (candidate, fingerprint, ip_address, user_agent)
        VALUES (p_candidate, p_fingerprint, p_ip_address, p_user_agent);
        
        -- Used fingerprints tablosuna ekle
        INSERT INTO used_fingerprints (
            fingerprint, ip_address, user_agent, candidate, 
            is_suspicious, suspicious_reason
        ) VALUES (
            p_fingerprint, p_ip_address, p_user_agent, p_candidate,
            (correlation_result->>'is_suspicious')::boolean,
            CASE WHEN (correlation_result->>'is_suspicious')::boolean 
                 THEN correlation_result->>'risk_level' 
                 ELSE NULL END
        );
        
        -- Rate limit kaydı ekle (başarılı)
        INSERT INTO ip_rate_limits (ip_address, fingerprint, success)
        VALUES (p_ip_address, p_fingerprint, true);
        
        final_result := jsonb_build_object(
            'success', true,
            'message', 'Oy başarıyla kaydedildi',
            'correlation_analysis', correlation_result
        );
        
    EXCEPTION WHEN OTHERS THEN
        -- Rate limit kaydı ekle (başarısız)
        INSERT INTO ip_rate_limits (ip_address, fingerprint, success, block_reason)
        VALUES (p_ip_address, p_fingerprint, false, SQLERRM);
        
        final_result := jsonb_build_object(
            'success', false,
            'error', 'Oy kaydedilemedi: ' || SQLERRM,
            'error_code', 'DATABASE_ERROR'
        );
    END;
    
    RETURN final_result;
END;
$$ LANGUAGE plpgsql;

-- 8. Güvenlik raporları için view'lar

-- Şüpheli aktiviteler özeti
CREATE OR REPLACE VIEW suspicious_activities_summary AS
SELECT 
    activity_type,
    severity,
    COUNT(*) as incident_count,
    COUNT(DISTINCT ip_address) as unique_ips,
    COUNT(DISTINCT fingerprint) as unique_fingerprints,
    MIN(detected_at) as first_detected,
    MAX(detected_at) as last_detected
FROM suspicious_activities
GROUP BY activity_type, severity
ORDER BY severity DESC, incident_count DESC;

-- IP istatistikleri
CREATE OR REPLACE VIEW ip_statistics AS
SELECT 
    ip_address,
    COUNT(DISTINCT fingerprint) as unique_fingerprints,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_votes,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_attempts,
    MIN(attempt_timestamp) as first_attempt,
    MAX(attempt_timestamp) as last_attempt
FROM ip_rate_limits
GROUP BY ip_address
HAVING COUNT(DISTINCT fingerprint) > 1
ORDER BY unique_fingerprints DESC, total_attempts DESC;

-- Gelişmiş seçim istatistikleri
CREATE OR REPLACE VIEW advanced_election_stats AS
SELECT 
    (SELECT COUNT(*) FROM votes) as total_votes,
    (SELECT COUNT(DISTINCT ip_address) FROM votes) as unique_ips,
    (SELECT COUNT(DISTINCT fingerprint) FROM votes) as unique_fingerprints,
    (SELECT COUNT(*) FROM used_fingerprints WHERE is_suspicious = true) as suspicious_votes,
    (SELECT COUNT(*) FROM suspicious_activities) as total_incidents,
    (SELECT COUNT(*) FROM ip_rate_limits WHERE success = false) as blocked_attempts,
    (SELECT AVG(unique_fingerprints) FROM ip_statistics) as avg_fingerprints_per_ip;

-- 9. Temizlik fonksiyonları

-- Eski rate limit kayıtlarını temizle (7 günden eski)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ip_rate_limits 
    WHERE attempt_timestamp < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Eski şüpheli aktivite kayıtlarını temizle (30 günden eski)
CREATE OR REPLACE FUNCTION cleanup_old_suspicious_activities()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM suspicious_activities 
    WHERE detected_at < NOW() - INTERVAL '30 days'
    AND severity < 3; -- Yüksek önem dereceli kayıtları sakla
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 10. Güvenlik notları
/*
GELİŞMİŞ GÜVENLİK SİSTEMİ KURULUM NOTLARI:

1. Bu script'i supabase-setup.sql'den SONRA çalıştırın
2. Tüm fonksiyonların düzgün çalıştığını test edin
3. Production'da düzenli olarak temizlik fonksiyonlarını çalıştırın
4. Şüpheli aktiviteleri düzenli olarak izleyin
5. Rate limit değerlerini ihtiyaca göre ayarlayın

KULLANIM:
- Oy vermek için: SELECT secure_vote_insert('candidate', 'fingerprint', 'ip'::inet, 'user_agent');
- Fingerprint kontrolü: SELECT check_fingerprint_used('fingerprint');
- IP rate limit kontrolü: SELECT check_ip_rate_limit('ip'::inet);
- Korelasyon analizi: SELECT analyze_ip_fingerprint_correlation('ip'::inet, 'fingerprint');

İZLEME:
- SELECT * FROM suspicious_activities_summary;
- SELECT * FROM ip_statistics;
- SELECT * FROM advanced_election_stats;
*/