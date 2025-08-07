-- IP bazlı unique constraint ekleme
-- Bu script votes tablosuna IP adresine göre unique constraint ekler
-- Her IP adresinden sadece bir oy kabul edilir

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

-- 2. IP bazlı unique constraint ekle
-- NOT: Bu işlemden önce duplicate oyları temizlemeniz gerekir!
-- cleanup-duplicate-votes.sql dosyasını önce çalıştırın

ALTER TABLE votes 
ADD CONSTRAINT votes_ip_address_unique UNIQUE (ip_address);

-- 3. Constraint'in başarıyla eklendiğini kontrol et
SELECT 
    constraint_name, 
    constraint_type,
    column_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'votes' 
    AND tc.constraint_type = 'UNIQUE'
    AND ccu.column_name = 'ip_address';

-- 4. Test: Aynı IP'den oy vermeyi dene (hata vermeli)
-- INSERT INTO votes (candidate, fingerprint, ip_address, user_agent) 
-- VALUES ('ersin-tatar', 'test_fingerprint_123', '192.168.1.100', 'Test Browser');
-- INSERT INTO votes (candidate, fingerprint, ip_address, user_agent) 
-- VALUES ('tufan-erhurman', 'test_fingerprint_456', '192.168.1.100', 'Test Browser 2');
-- İkinci INSERT hata vermeli: duplicate key value violates unique constraint "votes_ip_address_unique"