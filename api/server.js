const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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
    
    // Sadece güvenli karakterler (base64 + bazı özel karakterler)
    const validPattern = /^[a-zA-Z0-9+/=._-]+$/;
    return validPattern.test(fingerprint);
}

// Input sanitization fonksiyonu
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>"'&]/g, '').trim().substring(0, 100);
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
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // CSS için gerekli
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
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
    return req.ip + ':' + (req.get('User-Agent') || '').substring(0, 50);
  },
  handler: (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
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

// Oy verme endpoint'i
app.post('/api/vote', voteLimit, async (req, res) => {
  try {
    let { candidate, fingerprint } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Input sanitization
    candidate = sanitizeInput(candidate);
    fingerprint = sanitizeInput(fingerprint);
    
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
      // Supabase ile çalış
      
      // Fingerprint kontrolü
      const { data: existingFingerprintVote } = await supabase
        .from('votes')
        .select('id, created_at')
        .eq('fingerprint', fingerprint)
        .single();

      if (existingFingerprintVote) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Duplicate fingerprint');
        return res.status(409).json({ error: 'Bu cihazdan zaten oy kullanılmış' });
      }

      // IP kontrolü kaldırıldı - Sadece fingerprint (cihaz) kontrolü yapılıyor
      // Vercel'de aynı IP'den çok fazla istek sorunu nedeniyle IP kontrolü devre dışı

      // Oy kaydet
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
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Database error: ' + error.message);
        return res.status(500).json({ error: 'Oy kaydedilemedi: ' + error.message });
      }

      logVoteAttempt(clientIp, fingerprint, candidate, true, 'Vote recorded successfully');
    } else {
      // Demo modu
      
      // Fingerprint kontrolü (sadece cihaz bazlı kontrol)
      if (demoFingerprints.has(fingerprint)) {
        logVoteAttempt(clientIp, fingerprint, candidate, false, 'Duplicate fingerprint (demo)');
        return res.status(409).json({ error: 'Bu cihazdan zaten oy kullanılmış' });
      }
      
      // IP kontrolü kaldırıldı - aynı ağdan birden fazla kişi oy kullanabilir
      // Sadece fingerprint (cihaz) kontrolü yapılıyor
      
      demoFingerprints.add(fingerprint);
      // demoIpAddresses.add(clientIp); // IP kontrolü kaldırıldı
      demoVotes[candidate]++;
      
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
      // Supabase'den verileri al
      const { data, error } = await supabase
        .from('votes')
        .select('candidate');

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Sonuçlar alınamadı' });
      }

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