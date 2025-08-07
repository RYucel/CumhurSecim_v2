-- Duplicate oyları temizleme script'i
-- Bu script aynı IP adresinden gelen duplicate oyları temizler
-- Her IP adresinden sadece EN ESKİ oy tutulur, diğerleri silinir

-- 1. Önce duplicate oyları görmek için analiz sorgusu
-- (Bu sorguyu çalıştırarak kaç duplicate oy olduğunu görebilirsiniz)
SELECT 
    ip_address,
    COUNT(*) as vote_count,
    array_agg(DISTINCT candidate) as candidates,
    array_agg(DISTINCT fingerprint) as fingerprints,
    MIN(created_at) as first_vote,
    MAX(created_at) as last_vote
FROM votes 
GROUP BY ip_address 
HAVING COUNT(*) > 1
ORDER BY vote_count DESC;

-- 2. Aynı IP'den gelen duplicate oyları sil (EN ESKİ hariç)
-- Bu işlem geri alınamaz, dikkatli olun!
WITH duplicate_votes AS (
    SELECT 
        id,
        ip_address,
        fingerprint,
        candidate,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY ip_address 
            ORDER BY created_at ASC
        ) as row_num
    FROM votes
),
votes_to_delete AS (
    SELECT id, ip_address, fingerprint, candidate, created_at
    FROM duplicate_votes 
    WHERE row_num > 1  -- İlk oy hariç diğerlerini sil
)
DELETE FROM votes 
WHERE id IN (SELECT id FROM votes_to_delete);

-- 3. Temizlik sonrası kontrol sorgusu
SELECT 
    'Temizlik Sonrası' as durum,
    COUNT(*) as toplam_oy,
    COUNT(DISTINCT ip_address) as unique_ip_count,
    COUNT(DISTINCT fingerprint) as unique_fingerprint_count
FROM votes;

-- 4. IP başına oy dağılımını kontrol et
SELECT 
    ip_address,
    COUNT(*) as vote_count,
    array_agg(candidate) as candidates,
    MIN(created_at) as vote_time
FROM votes 
GROUP BY ip_address 
ORDER BY vote_count DESC, vote_time ASC;

-- 5. Aday başına oy sayılarını kontrol et
SELECT 
    candidate,
    COUNT(*) as vote_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM votes), 2) as percentage
FROM votes 
GROUP BY candidate 
ORDER BY vote_count DESC;