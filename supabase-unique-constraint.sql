-- Supabase SQL Editor'da çalıştırılacak komut
-- Bu komut votes tablosundaki fingerprint sütununa UNIQUE constraint ekler
-- Bu sayede aynı fingerprint ile birden fazla oy kaydedilemez (race condition koruması)

ALTER TABLE votes 
ADD CONSTRAINT votes_fingerprint_unique UNIQUE (fingerprint);

-- Constraint'in başarıyla eklendiğini kontrol etmek için:
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'votes' AND constraint_type = 'UNIQUE';