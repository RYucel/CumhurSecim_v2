-- IP ve fingerprint kombinasyonu bazlı unique constraint ekleme
-- Bu script votes tablosuna IP ve fingerprint kombinasyonuna göre unique constraint ekler
-- Her IP ve fingerprint kombinasyonundan sadece bir oy kabul edilir

-- 1. Önce mevcut duplicate IP'leri kontrol et
SELECT 
    ip_address,
    COUNT(*) as vote_count,
    array_agg(candidate) as candidates,
    array_agg(fingerprint) as fingerprints,
    MIN(created_at) as first_vote,
    MAX(created_at) as last_vote
FROM votes 
GROUP BY ip_address 
HAVING COUNT(*) > 1
ORDER BY vote_count DESC;

-- 2. IP ve fingerprint kombinasyonu bazlı unique constraint ekle
-- NOT: Bu işlemden önce duplicate oyları temizlemeniz gerekir!
-- cleanup-duplicate-votes.sql dosyasını önce çalıştırın

ALTER TABLE votes 
ADD CONSTRAINT votes_ip_fingerprint_unique UNIQUE (ip_address, fingerprint);

-- 3. Constraint'in başarıyla eklendiğini kontrol et
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    string_agg(ccu.column_name, ', ' ORDER BY ccu.ordinal_position) as columns
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'votes' 
    AND tc.constraint_type = 'UNIQUE'
    AND tc.constraint_name = 'votes_ip_fingerprint_unique'
GROUP BY tc.constraint_name, tc.constraint_type;

-- 4. Test: Aynı IP ve fingerprint kombinasyonundan oy vermeyi dene (hata vermeli)
-- INSERT INTO votes (candidate, fingerprint, ip_address, user_agent) 
-- VALUES ('ersin-tatar', 'test_fingerprint_123', '192.168.1.100', 'Test Browser');
-- INSERT INTO votes (candidate, fingerprint, ip_address, user_agent) 
-- VALUES ('tufan-erhurman', 'test_fingerprint_123', '192.168.1.100', 'Test Browser');
-- İkinci INSERT hata vermeli: duplicate key value violates unique constraint "votes_ip_fingerprint_unique"