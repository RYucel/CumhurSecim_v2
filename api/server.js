const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // VPN/Proxy kontrolü için
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy ayarı - gerçek IP adresini almak için
// Sadece Vercel ve localhost için trust proxy
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Supabase yapılandırması
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

// Supabase bağlantısını kontrol et
console.log('Environment check:');
console.log('SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET');
console.log('SUPABASE_ANON_KEY:', supabaseKey ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);

if (supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_project_url_here') {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('Supabase bağlantısı kuruldu:', supabaseUrl.substring(0, 30) + '...');
    } catch (error) {
        console.error('Supabase bağlantısı kurulamadı:', error.message);
        console.error('Error details:', error);
    }
} else {
    console.warn('Supabase yapılandırması bulunamadı. Demo modunda çalışıyor.');
    console.warn('URL:', supabaseUrl || 'undefined');
    console.warn('KEY:', supabaseKey ? 'defined' : 'undefined');
}

// Demo verileri (Supabase olmadan test için)
let demoVotes = {
    'ersin-tatar': 0,
    'tufan-erhurman': 0,
    'mehmet-hasguler': 0
};
let demoFingerprints = new Set();
let demoIpAddresses = new Set();
let demoVoteLog = [];
let demoVoteHistory = []; // Zaman damgalı oy geçmişi (demo modu için)

// Incognito mod koruması için çok katmanlı kontrol
let deviceSignatures = new Map(); // IP + UserAgent + Fingerprint kombinasyonları
let ipVoteCounts = new Map(); // IP başına oy sayısı (incognito koruması)

// Seçim zamanı kısıtlamaları
// KKTC Cumhurbaşkanlığı Seçimi: Anket amaçlı süresiz oy verme
const ELECTION_END = new Date('2025-12-31T23:59:59+03:00');   // 31 Aralık 2025, 23:59 (UTC+3)

// Test modu için environment variable
const TEST_MODE = process.env.NODE_ENV === 'development' || process.env.TEST_MODE === 'true';

// Güvenlik fonksiyonları
function isElectionTime() {
    // Test modunda her zaman true döndür
    if (TEST_MODE) {
        return true;
    }
    
    const now = new Date();
    return now <= ELECTION_END;
}

function validateFingerprint(fingerprint) {
    // Güvenli fingerprint validasyonu
    if (!fingerprint || typeof fingerprint !== 'string') {
        return false;
    }
    
    // Uzunluk kontrolü (10-64 karakter arası)
    if (fingerprint.length < 10 || fingerprint.length > 64) {
        return false;
    }
    
    // Yeni fingerprint formatları için genişletilmiş pattern
    // fp_ ile başlayan normal fingerprint'ler
    // fallback_ ile başlayan fallback fingerprint'ler
    // Eski format için sadece alfanumerik karakterler
    const validPattern = /^(fp_[a-zA-Z0-9_]+|fallback_[a-zA-Z0-9_]+|[a-zA-Z0-9+/=._-]+)$/;
    return validPattern.test(fingerprint);
}

// Fallback fingerprint kontrolü (incognito mod tespiti)
function isFallbackFingerprint(fingerprint) {
    return fingerprint && fingerprint.startsWith('fallback_');
}

// Fallback fingerprint'in base kısmını al (zaman damgası ve rastgele kısım hariç)
function getFallbackBase(fingerprint) {
    if (!isFallbackFingerprint(fingerprint)) return fingerprint;
    
    const parts = fingerprint.split('_');
    if (parts.length >= 3) {
        // fallback_hash1_hash2 kısmını al (zaman damgası ve rastgele kısım hariç)
        return parts[0] + '_' + parts[1] + '_' + parts[2];
    }
    return fingerprint;
}

// Input sanitization fonksiyonu
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>"'&]/g, '').substring(0, 100);
}

// Gerçek IP adresini almak için fonksiyon
function getRealIpAddress(req) {
  // Proxy header'larını kontrol et
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip']; // Cloudflare
  
  if (forwarded) {
    // X-Forwarded-For birden fazla IP içerebilir, ilkini al
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  if (realIp) {
    return realIp;
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Express.js'in IP'si (trust proxy ile)
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

// IP adresinin kalitesini kontrol eden fonksiyon (VPN/Proxy tespiti)
async function checkIpForVpn(ip) {
  try {
    // Sadece proxy ve hosting bilgisini almak için fields parametresini kullanıyoruz.
    // Bu, yanıt boyutunu küçültür ve işlemi hızlandırır.
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,proxy,hosting`);

    if (response.data.status === 'success') {
      // Eğer 'proxy' veya 'hosting' (veri merkezi) true ise, bu şüpheli bir IP'dir.
      const isVpnOrProxy = response.data.proxy || response.data.hosting;
      return { isVpnOrProxy };
    }
     
    // API'den başarısız bir yanıt gelirse
    return { isVpnOrProxy: false, error: `API Error: ${response.data.message}` };

  } catch (error) {
    console.error('IP-API kontrolü sırasında hata:', error.message);
    // Harici API'ye ulaşılamazsa, kullanıcıyı engellememek için
    // şüpheli olmadığını varsayıyoruz (fail-open).
    return { isVpnOrProxy: false, error: 'API connection failed' };
  }
}

function logVoteAttempt(ip, fingerprint, candidate, success, reason = '') {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ip_address: ip,
        fingerprint: fingerprint.substring(0, 10) + '...', // Güvenlik için kısalt
        candidate: candidate,
        success: success,
        reason: reason
    };
    
    if (supabase) {
        // Supabase'e log kaydet (fire and forget)
        supabase.from('vote_logs').insert([logEntry]).then().catch(console.error);
    } else {
        demoVoteLog.push(logEntry);
        // Son 1000 log'u tut
        if (demoVoteLog.length > 1000) {
            demoVoteLog = demoVoteLog.slice(-1000);
        }
    }
}

// Güvenlik middleware'leri
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://openfpcdn.io", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], // CSS için gerekli
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://ip-api.com", "https://openfpcdn.io"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Compatibility için
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting - Her IP için dakikada 2 oy denemesi (daha sıkı)
const voteLimit = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 2, // maksimum 2 istek
  message: { error: 'Çok fazla oy verme denemesi. 1 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // IP + User-Agent kombinasyonu ile daha güvenli tracking
    const realIp = getRealIpAddress(req);
    return realIp + ':' + (req.get('User-Agent') || '').substring(0, 50);
  },
  handler: (req, res) => {
    const clientIp = getRealIpAddress(req);
    logVoteAttempt(clientIp, 'rate-limited', 'unknown', false, 'Rate limit exceeded');
    res.status(429).json({ error: 'Çok fazla oy verme denemesi. 1 dakika bekleyin.' });
  }
});

// Genel rate limiting
const generalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100, // maksimum 100 istek
  message: { error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' }
});

app.use(generalLimit);

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Manifest.json için özel route (Vercel deployment fix)
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(__dirname + '/public/manifest.json');
});

// PWA ve static dosyalar için ek route'lar
app.get('/favicon.ico', (req, res) => {
  res.sendFile(__dirname + '/public/favicon.ico');
});

app.get('/apple-touch-icon.png', (req, res) => {
  res.sendFile(__dirname + '/public/apple-touch-icon.png');
});

// Oy verme endpoint'i
app.post('/api/vote', voteLimit, async (req, res) => {
  try {
    let { candidate, fingerprint } = req.body;
    const clientIp = getRealIpAddress(req);
    
    // Input sanitization
    candidate = sanitizeInput(candidate);
    fingerprint = sanitizeInput(fingerprint);
    
    // VPN/Proxy kontrolü - IP adresini aldıktan hemen sonra kontrol et
    const ipCheck = await checkIpForVpn(clientIp);
    if (ipCheck.isVpnOrProxy) {
      logVoteAttempt(clientIp, fingerprint || 'unknown', candidate || 'unknown', false, 'VPN/Proxy detected');
      return res.status(403).json({ 
        error: 'VPN veya Proxy kullanımı tespit edildi. Lütfen normal internet bağlantısı kullanarak tekrar deneyin.',
        details: 'Güvenlik nedeniyle VPN, Proxy veya veri merkezi IP adresleri engellenmektedir.'
      });
    }
    
    // Temel validasyonlar
    if (!candidate || !fingerprint) {
      logVoteAttempt(clientIp, fingerprint || 'missing', candidate || 'missing', false, 'Missing required fields');
      return res.status(400).json({ error: 'Aday ve parmak izi gerekli' });
    }
    
    // Request body size kontrolü
    if (JSON.stringify(req.body).length > 1000) {
      logVoteAttempt(clientIp, fingerprint, candidate, false, 'Request too large');
      return res.status(413).json({ error: 'İstek çok büyük' });
    }

    // Seçim zamanı kontrolü
    if (!isElectionTime()) {
      logVoteAttempt(clientIp, fingerprint, candidate, false, 'Election period ended');
      return res.status(403).json({ 
        error: 'Anket süresi sona ermiştir. Son oy verme tarihi: 31 Aralık 2025',
        election_end: ELECTION_END.toISOString()
      });
    }

    // Fingerprint validasyonu
    if (!validateFingerprint(fingerprint)) {
      logVoteAttempt(clientIp, fingerprint, candidate, false, 'Invalid fingerprint format');
      return res.status(400).json({ error: 'Geçersiz cihaz kimliği' });
    }

    // Geçerli adaylar
    const validCandidates = ['ersin-tatar', 'tufan-erhurman', 'mehmet-hasguler'];
    if (!validCandidates.includes(candidate)) {
      logVoteAttempt(clientIp, fingerprint, candidate, false, 'Invalid candidate');
      return res.status(400).json({ error: 'Geçersiz aday' });
    }

    if (supabase) {
      // Supabase ile çalış - Atomik işlem (Race Condition koruması)
      
      // Fallback fingerprint özel kontrolü (incognito mod) - Sıkılaştırılmış
      if (isFallbackFingerprint(fingerprint)) {
        // Aynı IP'den herhangi bir fallback fingerprint varsa engelle
        const { data: fallbackVotes } = await supabase
          .from('votes')
          .select('fingerprint, ip_address')
          .eq('ip_address', clientIp)
          .like('fingerprint', 'fallback_%');

        if (fallbackVotes && fallbackVotes.length > 0) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Fallback fingerprint - aynı IP\'den zaten fallback oy var');
          return res.status(409).json({ 
            error: 'Bu ağ bağlantısından zaten incognito/gizli modda oy kullanılmış. Her IP adresinden sadece bir fallback oy kabul edilir.' 
          });
        }
      }

      // Gelişmiş incognito mod koruması: Sadece aşırı şüpheli durumları engelle
      const userAgent = req.get('User-Agent') || '';
      
      // Aynı IP'den çok fazla farklı fingerprint gelirse şüpheli
      const { data: ipVotes } = await supabase
        .from('votes')
        .select('fingerprint, created_at') // created_at zamanını da al
        .eq('ip_address', clientIp);
      
      if (ipVotes && ipVotes.length >= 10) { // Limiti 3'ten 10'a yükselt
        const uniqueFingerprints = new Set(ipVotes.map(v => v.fingerprint));
        // Son 1 saat içinde gelen oyları kontrol et
        const now = new Date();
        const recentVotes = ipVotes.filter(v => (now - new Date(v.created_at)) < 3600 * 1000);
        
        // Eğer son 1 saatte aynı IP'den 5'ten fazla farklı cihaz oy kullandıysa engelle
        if (recentVotes.length >= 5 && !uniqueFingerprints.has(fingerprint)) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Aynı IP\'den kısa sürede çok fazla oy denemesi');
          return res.status(409).json({ 
            error: 'Bu ağ bağlantısından kısa süre içinde çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.' 
          });
        }
      }

      // IP ve fingerprint kombinasyonu bazlı duplicate kontrol
      const { data: existingVote } = await supabase
        .from('votes')
        .select('id, fingerprint, candidate, created_at')
        .eq('ip_address', clientIp)
        .eq('fingerprint', fingerprint)
        .limit(1);

      if (existingVote && existingVote.length > 0) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Aynı IP ve cihaz kombinasyonundan zaten oy kullanılmış');
        return res.status(409).json({ 
          error: 'Bu cihazdan zaten oy kullanılmış. Her cihazdan sadece bir oy kabul edilir.',
          details: 'Güvenlik nedeniyle aynı ağ bağlantısından birden fazla oy kullanılamaz.'
        });
      }

      // Atomik oy kaydetme - Doğrudan insert yap, hata alırsan duplicate demektir
      const { data, error } = await supabase
        .from('votes')
        .insert([
          {
            candidate: candidate,
            fingerprint: fingerprint,
            ip_address: clientIp,
            user_agent: req.get('User-Agent') || '',
            created_at: new Date().toISOString()
          }
        ]);

      if (error) {
        console.error('Supabase insert error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        // PostgreSQL unique constraint hatası (23505) - Duplicate fingerprint
        if (error.code === '23505' && error.message.includes('votes_fingerprint_unique')) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Duplicate fingerprint (race condition prevented)');
          return res.status(409).json({ error: 'Bu cihazdan zaten oy kullanılmış' });
        }
        
        // Diğer veritabanı hataları
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Database error: ' + error.message);
        return res.status(500).json({ error: 'Oy kaydedilemedi: ' + error.message });
      }

      logVoteAttempt(clientIp, fingerprint, candidate, true, 'Vote recorded successfully');
    } else {
      // Demo modu - Atomik işlem (Race Condition koruması)
      
      // IP ve fingerprint kombinasyonu bazlı duplicate kontrol (demo modu)
      const existingVote = demoVoteHistory.find(vote => 
        vote.ip_address === clientIp && vote.fingerprint === fingerprint
      );
      if (existingVote) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Aynı IP ve cihaz kombinasyonundan zaten oy kullanılmış (demo)');
        return res.status(409).json({ 
          error: 'Bu cihazdan zaten oy kullanılmış. Her cihazdan sadece bir oy kabul edilir.',
          details: 'Güvenlik nedeniyle aynı cihazdan birden fazla oy kullanılamaz.'
        });
      }

      // Atomik fingerprint kontrolü - Önce kaydetmeye çalış, duplicate varsa hata ver
      if (demoFingerprints.has(fingerprint)) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Bu cihazdan zaten oy kullanılmış (demo)');
        return res.status(409).json({ error: 'Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.' });
      }
      
      // Fallback fingerprint özel kontrolü (demo modunda incognito) - Sıkılaştırılmış
      if (isFallbackFingerprint(fingerprint)) {
        // Demo modunda aynı IP'den herhangi bir fallback fingerprint varsa engelle
        const ipFallbackExists = demoVoteHistory.some(vote => 
          vote.ip_address === clientIp && isFallbackFingerprint(vote.fingerprint)
        );
        
        if (ipFallbackExists) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Demo: Fallback fingerprint - aynı IP\'den zaten fallback oy var');
          return res.status(409).json({ 
            error: 'Bu ağ bağlantısından zaten incognito/gizli modda oy kullanılmış. Her IP adresinden sadece bir fallback oy kabul edilir.' 
          });
        }
      }
      
      // Incognito mod koruması: IP + User-Agent kombinasyonu kontrolü
      const userAgent = req.get('User-Agent') || '';
      const deviceSignature = `${clientIp}|${userAgent.substring(0, 100)}`;
      
      // Aynı IP ve User-Agent'tan farklı fingerprint ile oy kontrolü
      for (const [signature, storedFingerprint] of deviceSignatures.entries()) {
        if (signature.startsWith(clientIp + '|') && 
            signature.includes(userAgent.substring(0, 50)) && 
            storedFingerprint !== fingerprint) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Possible incognito mode detected (demo)');
          return res.status(409).json({ 
            error: 'Bu ağ bağlantısından ve tarayıcıdan zaten oy kullanılmış. Incognito/gizli mod kullanımı tespit edildi.' 
          });
        }
      }
      
      // Zaman bazlı incognito mod koruması (demo modu)
      const now = new Date();
      const recentDemoVotes = demoVoteHistory.filter(vote => 
        vote.ip_address === clientIp && 
        (now - new Date(vote.timestamp)) < 3600 * 1000 // Son 1 saat
      );
      
      // Son 1 saatte aynı IP'den 5'ten fazla oy varsa engelle
      if (recentDemoVotes.length >= 5) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Aynı IP\'den kısa sürede çok fazla oy denemesi (demo)');
        return res.status(409).json({ 
          error: 'Bu ağ bağlantısından kısa süre içinde çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.' 
        });
      }
      
      // IP başına maksimum oy sayısı kontrolü (incognito koruması) - daha esnek
      const currentIpVotes = ipVoteCounts.get(clientIp) || 0;
      if (currentIpVotes >= 10) { // Aynı IP'den maksimum 10 oy (3'ten yükseltildi)
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'IP vote limit exceeded (demo)');
        return res.status(409).json({ 
          error: 'Bu ağ bağlantısından çok fazla oy kullanılmış. Lütfen farklı bir ağ bağlantısı kullanın.' 
        });
      }
      
      // Atomik kayıt işlemi - Tüm değişiklikleri tek seferde yap (Race Condition koruması)
      // Bu noktada tüm kontroller geçildi, artık güvenle kaydedebiliriz
      try {
        // Tekrar kontrol et (double-check locking pattern)
        if (demoFingerprints.has(fingerprint)) {
          logVoteAttempt(clientIp, fingerprint, candidate, false, 'Race condition detected - duplicate fingerprint (demo)');
          return res.status(409).json({ error: 'Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.' });
        }
        
        // Atomik güncelleme
        demoFingerprints.add(fingerprint);
        deviceSignatures.set(deviceSignature, fingerprint);
        ipVoteCounts.set(clientIp, currentIpVotes + 1);
        demoVotes[candidate]++;
        
        // Zaman damgalı oy geçmişine ekle (demo modu)
        demoVoteHistory.push({
          timestamp: new Date().toISOString(),
          ip_address: clientIp,
          fingerprint: fingerprint,
          candidate: candidate
        });
        
        // Son 1000 oy geçmişini tut (bellek yönetimi)
        if (demoVoteHistory.length > 1000) {
          demoVoteHistory = demoVoteHistory.slice(-1000);
        }
      } catch (atomicError) {
        console.error('Demo atomic operation error:', atomicError);
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Atomic operation failed (demo)');
        return res.status(500).json({ error: 'Oy kaydedilemedi' });
      }
      
      logVoteAttempt(clientIp, fingerprint, candidate, true, 'Vote recorded successfully (demo)');
      console.log('Demo oy kaydedildi:', candidate, 'IP:', clientIp, 'Fingerprint:', fingerprint.substring(0, 10) + '...');
    }

    res.json({ 
      success: true, 
      message: 'Oyunuz başarıyla kaydedildi',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Vote error:', error);
    logVoteAttempt(req.ip, req.body?.fingerprint || 'unknown', req.body?.candidate || 'unknown', false, 'Server error');
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Admin paneli için log görüntüleme (güvenli auth ile)
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { auth_key } = req.query;
    
    // Güvenli admin key kontrolü
    const ADMIN_KEY = process.env.ADMIN_KEY;
    
    // Admin key yoksa veya boşsa erişimi reddet
    if (!ADMIN_KEY || ADMIN_KEY === 'admin123' || ADMIN_KEY.length < 10) {
      return res.status(503).json({ error: 'Admin paneli yapılandırılmamış' });
    }
    if (auth_key !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    let logs = [];
    let stats = {
      total_attempts: 0,
      successful_votes: 0,
      failed_attempts: 0,
      unique_ips: new Set(),
      unique_fingerprints: new Set()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('vote_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (!error && data) {
        logs = data;
        stats.total_attempts = data.length;
        data.forEach(log => {
          if (log.success) stats.successful_votes++;
          else stats.failed_attempts++;
          stats.unique_ips.add(log.ip_address);
          stats.unique_fingerprints.add(log.fingerprint);
        });
      }
    } else {
      logs = demoVoteLog.slice(-100);
      stats.total_attempts = demoVoteLog.length;
      demoVoteLog.forEach(log => {
        if (log.success) stats.successful_votes++;
        else stats.failed_attempts++;
        stats.unique_ips.add(log.ip_address);
        stats.unique_fingerprints.add(log.fingerprint);
      });
    }

    res.json({
      logs: logs,
      statistics: {
        total_attempts: stats.total_attempts,
        successful_votes: stats.successful_votes,
        failed_attempts: stats.failed_attempts,
        unique_ips: stats.unique_ips.size,
        unique_fingerprints: stats.unique_fingerprints.size,
        success_rate: stats.total_attempts > 0 ? ((stats.successful_votes / stats.total_attempts) * 100).toFixed(2) + '%' : '0%'
      }
    });
  } catch (error) {
    console.error('Admin logs error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Sistem durumu kontrolü
app.get('/api/status', (req, res) => {
  const now = new Date();
  res.json({
    server_time: now.toISOString(),
    election_active: isElectionTime(),
    election_end: ELECTION_END.toISOString(),
    database_connected: !!supabase,
    uptime: process.uptime()
  });
});

// Debug endpoint for Supabase connection (removed for production)
// app.get('/api/debug/supabase', async (req, res) => {
//   try {
//     if (!supabase) {
//       return res.json({ error: 'Supabase not connected', supabase: null });
//     }
//     
//     // Test Supabase connection
//     const { data, error } = await supabase
//       .from('votes')
//       .select('*')
//       .limit(5);
//     
//     if (error) {
//       return res.json({ error: 'Supabase query error', details: error });
//     }
//     
//     res.json({ 
//       success: true, 
//       supabase: 'connected',
//       sampleData: data,
//       totalRows: data.length
//     });
//   } catch (err) {
//     res.json({ error: 'Debug error', details: err.message });
//   }
// });

// Sonuçları getir
app.get('/api/results', async (req, res) => {
  try {
    let results = {
      'ersin-tatar': 0,
      'tufan-erhurman': 0,
      'mehmet-hasguler': 0,
      total: 0
    };

    if (supabase) {
      // Supabase'den verileri çek
      
      // Supabase'den tüm verileri al (pagination ile)
      let allData = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: batchData, error: batchError } = await supabase
          .from('votes')
          .select('candidate')
          .range(from, from + batchSize - 1);
        
        if (batchError) {
          console.error('Batch error:', batchError);
          break;
        }
        
        if (batchData && batchData.length > 0) {
          allData = allData.concat(batchData);
          from += batchSize;
          hasMore = batchData.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      const data = allData;
      const error = null;

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Sonuçlar alınamadı' });
      }

      // Veri başarıyla alındı
      
      results.total = data.length;
      data.forEach(vote => {
        if (results.hasOwnProperty(vote.candidate)) {
          results[vote.candidate]++;
        }
      });
    } else {
      // Demo modundan verileri al
      results = {
        'ersin-tatar': demoVotes['ersin-tatar'],
        'tufan-erhurman': demoVotes['tufan-erhurman'],
        'mehmet-hasguler': demoVotes['mehmet-hasguler'],
        total: demoVotes['ersin-tatar'] + demoVotes['tufan-erhurman'] + demoVotes['mehmet-hasguler']
      };
    }

    // Yüzdeleri hesapla
    const totalVotes = results.total;
    const percentages = {
      'ersin-tatar': totalVotes > 0 ? ((results['ersin-tatar'] / totalVotes) * 100).toFixed(1) : 0,
      'tufan-erhurman': totalVotes > 0 ? ((results['tufan-erhurman'] / totalVotes) * 100).toFixed(1) : 0,
      'mehmet-hasguler': totalVotes > 0 ? ((results['mehmet-hasguler'] / totalVotes) * 100).toFixed(1) : 0
    };

    res.json({
      votes: results,
      percentages: percentages
    });
  } catch (error) {
    console.error('Results error:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});

module.exports = app;