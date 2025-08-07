// Global değişkenler
let selectedCandidate = null;
let userFingerprint = null;
let hasVoted = false;
let resultsChart = null;
let lastUpdateData = null;
let chartUpdateTimeout = null;

// Chart.js yüklenmesini bekle
async function waitForChart() {
    if (typeof Chart !== 'undefined') {
        console.log('Chart.js başarıyla yüklendi!');
        await initializeApp();
    } else {
        console.log('Chart.js bekleniyor...');
        setTimeout(waitForChart, 100);
    }
}

// Uygulama başlatma
window.addEventListener('load', function() {
    console.log('Window loaded, Chart.js kontrol ediliyor...');
    waitForChart();
});

// Uygulamayı başlat
async function initializeApp() {
    await generateFingerprint();
    setupEventListeners();
    startCountdown();
    loadResults();
    checkVoteStatus();
    initializeChart();
}

// Basit tarayıcı parmak izi oluştur
function generateFingerprint() {
    try {
        // HTML'de tanımlanan basit fingerprint fonksiyonunu kullan
        if (typeof window.generateBrowserFingerprint === 'function') {
            userFingerprint = window.generateBrowserFingerprint();
            console.log('Simple fingerprint generated:', userFingerprint.substring(0, 10) + '...');
            return;
        }
        
        console.warn('Basit fingerprint fonksiyonu bulunamadı, fallback sisteme geçiliyor...');
        
    } catch (error) {
        console.warn('Fingerprint oluşturma hatası, fallback sisteme geçiliyor:', error);
        
        // Tamamen deterministik fallback sistem
        
        // WebGL fingerprinting (deterministik)
        let webglInfo = '';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    webglInfo = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) + '|' + 
                               gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
                webglInfo += '|' + gl.getParameter(gl.VERSION);
            }
        } catch (e) {
            webglInfo = 'webgl_error';
        }
        
        // Audio context fingerprinting (deterministik)
        let audioFingerprint = '';
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioFingerprint = audioCtx.sampleRate + '|' + audioCtx.state + '|' + (audioCtx.baseLatency || 'unknown');
            audioCtx.close();
        } catch (e) {
            audioFingerprint = 'audio_error';
        }
        
        // Tamamen deterministik cihaz bilgileri (canvas ve değişken değerler yok)
        const deviceInfo = [
            navigator.userAgent,
            navigator.language,
            navigator.languages ? navigator.languages.join(',') : '',
            navigator.platform,
            navigator.cookieEnabled ? 'true' : 'false',
            navigator.doNotTrack || 'unspecified',
            navigator.hardwareConcurrency || 'unknown',
            navigator.maxTouchPoints || 0,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            screen.pixelDepth,
            window.devicePixelRatio || 1,
            new Date().getTimezoneOffset(),
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
            // Canvas kaldırıldı - deterministik değil
            webglInfo,
            audioFingerprint,
            // Tarayıcı özelliklerini ekle
            'localStorage' in window ? 'true' : 'false',
            'sessionStorage' in window ? 'true' : 'false',
            'indexedDB' in window ? 'true' : 'false',
            navigator.plugins ? navigator.plugins.length.toString() : '0',
            navigator.vendor || 'unknown',
            navigator.product || 'unknown',
            navigator.productSub || 'unknown',
            navigator.appName || 'unknown',
            navigator.appVersion || 'unknown'
        ].join('|');
        
        // Çoklu deterministik hash algoritması
        let hash1 = 5381; // DJB2 hash
        let hash2 = 0;     // FNV-1a benzeri
        let hash3 = 1;     // Çarpımsal hash
        
        for (let i = 0; i < deviceInfo.length; i++) {
            const char = deviceInfo.charCodeAt(i);
            
            // DJB2 hash algoritması
            hash1 = ((hash1 << 5) + hash1) + char;
            hash1 = hash1 & 0x7FFFFFFF;
            
            // FNV-1a benzeri hash
            hash2 = hash2 ^ char;
            hash2 = (hash2 * 16777619) & 0x7FFFFFFF;
            
            // Basit çarpımsal hash
            hash3 = (hash3 * 31 + char) & 0x7FFFFFFF;
        }
        
        // Tamamen deterministik fallback fingerprint oluştur
        const part1 = hash1.toString(36);
        const part2 = hash2.toString(36);
        const part3 = hash3.toString(36);
        
        userFingerprint = 'fallback_' + part1 + '_' + part2 + '_' + part3;
        
        console.log('Tamamen deterministik fallback fingerprint generated:', userFingerprint.substring(0, 20) + '...');
    }
    
    // Local storage'da kontrol et
    // Yerel storage'dan oy durumunu kontrol et
    const hasVotedLocally = localStorage.getItem('hasVoted');
    const votedFingerprint = localStorage.getItem('votedFingerprint');
    
    if (hasVotedLocally === 'true' && votedFingerprint === userFingerprint) {
        hasVoted = true;
        disableVoting('Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.');
    }
    
    // Eski sistem ile uyumluluk için
    const votedKey = 'kktc_voted_' + userFingerprint;
    if (localStorage.getItem(votedKey) === 'true') {
        hasVoted = true;
        disableVoting('Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.');
        // Yeni sisteme geçiş
        localStorage.setItem('hasVoted', 'true');
        localStorage.setItem('votedFingerprint', userFingerprint);
    }
}

// Event listener'ları ayarla
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Candidate selection
    document.querySelectorAll('.candidate-card').forEach(card => {
        card.addEventListener('click', function() {
            if (!hasVoted) {
                selectCandidate(this.dataset.candidate);
            }
        });
    });
    
    // Vote button
    document.getElementById('vote-btn').addEventListener('click', function() {
        if (selectedCandidate && !hasVoted) {
            showVoteModal();
        }
    });
    
    // Modal buttons
    document.getElementById('confirm-vote').addEventListener('click', submitVote);
    document.getElementById('cancel-vote').addEventListener('click', hideVoteModal);
    
    // Modal backdrop click
    document.getElementById('vote-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            hideVoteModal();
        }
    });
}

// Tab değiştir
function switchTab(tabName) {
    // Tüm tab'ları gizle
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Seçilen tab'ı göster
    document.getElementById(tabName + '-section').classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Eğer sonuçlar sekmesine geçildiyse chart'ı yeniden başlat
    if (tabName === 'results') {
        console.log('Sonuçlar sekmesine geçildi, chart kontrol ediliyor...');
        setTimeout(() => {
            if (!resultsChart) {
                console.log('Chart yok, yeniden başlatılıyor...');
                initializeChart();
            } else {
                console.log('Chart mevcut:', resultsChart);
            }
        }, 100);
    }
}

// Aday seç
function selectCandidate(candidate) {
    if (hasVoted) return;
    
    // Önceki seçimi temizle
    document.querySelectorAll('.candidate-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Yeni seçimi işaretle
    document.querySelector(`[data-candidate="${candidate}"]`).classList.add('selected');
    selectedCandidate = candidate;
    
    // Vote button'ı aktif et
    document.getElementById('vote-btn').disabled = false;
}

// Oy verme modal'ını göster
function showVoteModal() {
    const candidateNames = {
        'tufan-erhurman': 'Tufan Erhürman',
        'ersin-tatar': 'Ersin Tatar',
        'mehmet-hasguler': 'Mehmet Hasgüler'
    };
    
    document.getElementById('vote-confirmation-text').textContent = 
        `${candidateNames[selectedCandidate]} için oy kullanmak istediğinizden emin misiniz?`;
    
    document.getElementById('vote-modal').classList.add('show');
}

// Modal'ı gizle
function hideVoteModal() {
    document.getElementById('vote-modal').classList.remove('show');
}

// Oy gönder
async function submitVote() {
    if (!selectedCandidate || hasVoted) return;
    
    try {
        const response = await fetch('/api/vote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                candidate: selectedCandidate,
                fingerprint: userFingerprint
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Başarılı oy
            localStorage.setItem('kktc_voted_' + userFingerprint, 'true');
            hasVoted = true;
            
            // Yerel storage'a oy kullanım bilgisini kaydet
            localStorage.setItem('hasVoted', 'true');
            localStorage.setItem('votedFingerprint', userFingerprint);
            localStorage.setItem('votedCandidate', selectedCandidate);
            localStorage.setItem('voteTimestamp', new Date().toISOString());
            
            // Eski sistem ile uyumluluk için
            const votedKey = 'kktc_voted_' + userFingerprint;
            localStorage.setItem(votedKey, 'true');
            
            showMessage('Oyunuz başarıyla kaydedildi!', 'success');
            disableVoting('Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.');
            loadResults(); // Sonuçları güncelle
            
            // Oy verdikten sonra sonuçlar sekmesine geç
            setTimeout(() => {
                switchTab('results');
                showMessage('Güncel sonuçları aşağıda görebilirsiniz.', 'info');
            }, 2000);
            
        } else {
            // Hata
            showMessage(data.error || 'Oy kaydedilemedi', 'error');
        }
        
    } catch (error) {
        console.error('Vote error:', error);
        showMessage('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
    }
    
    hideVoteModal();
}

// Oylama durumunu kontrol et
async function checkVoteStatus() {
    // Yerel storage'dan oy durumunu kontrol et
    const hasVotedLocally = localStorage.getItem('hasVoted');
    const votedFingerprint = localStorage.getItem('votedFingerprint');
    
    if (hasVotedLocally === 'true' && votedFingerprint === userFingerprint) {
        disableVoting('Bu cihazdan zaten oy kullanılmış. Her cihaz sadece bir kez oy kullanabilir.');
        hasVoted = true;
    }
}

// Oylamayı devre dışı bırak
function disableVoting(message) {
    hasVoted = true;
    
    // Tüm candidate card'ları devre dışı bırak
    document.querySelectorAll('.candidate-card').forEach(card => {
        card.style.pointerEvents = 'none';
        card.style.opacity = '0.7';
    });
    
    // Vote button'ı devre dışı bırak
    const voteBtn = document.getElementById('vote-btn');
    voteBtn.disabled = true;
    voteBtn.textContent = message;
    voteBtn.style.background = '#6c757d';
}

// Sonuçları yükle
async function loadResults() {
    try {
        console.log('Sonuçlar yükleniyor...');
        const response = await fetch('/api/results');
        const data = await response.json();
        
        if (response.ok) {
            console.log('API\'den gelen sonuçlar:', data);
            updateResults(data);
        } else {
            console.error('Results error:', data.error);
        }
        
    } catch (error) {
        console.error('Load results error:', error);
    }
}

// Sonuçları güncelle
function updateResults(data) {
    console.log('updateResults çağrıldı, veri:', data);
    const { votes, percentages } = data;
    
    // Toplam oy sayısını güncelle
    document.getElementById('total-votes').textContent = votes.total.toLocaleString('tr-TR');
    
    // Her aday için yüzdeyi güncelle
    Object.keys(percentages).forEach(candidate => {
        const percentageElement = document.getElementById(`percentage-${candidate}`);
        if (percentageElement) {
            percentageElement.textContent = percentages[candidate] + '%';
        }
    });
    
    // Sonuçlar sekmesindeki verileri güncelle
    updateResultsTab(data);
    
    // Grafiği güncelle
    console.log('Chart güncelleme çağrılıyor...');
    updateChart(data);
}

// Sonuçlar sekmesini güncelle
function updateResultsTab(data) {
    const { votes, percentages } = data;
    
    // Toplam oy sayısını güncelle
    const totalVotesElement = document.getElementById('results-total-votes');
    if (totalVotesElement) {
        totalVotesElement.textContent = votes.total.toLocaleString('tr-TR');
    }
    
    // Her aday için oy sayısı ve yüzdeyi güncelle
    const candidateMapping = {
        'ersin-tatar': 'ersin',
        'tufan-erhurman': 'tufan',
        'mehmet-hasguler': 'mehmet'
    };
    
    Object.keys(candidateMapping).forEach(candidate => {
        const shortName = candidateMapping[candidate];
        const votesElement = document.getElementById(`${shortName}-votes`);
        const percentageElement = document.getElementById(`${shortName}-percentage`);
        
        if (votesElement && votes[candidate] !== undefined) {
            votesElement.textContent = votes[candidate].toLocaleString('tr-TR');
        }
        if (percentageElement && percentages[candidate] !== undefined) {
            percentageElement.textContent = percentages[candidate];
        }
    });
}

// Basit bar chart oluştur
function initializeChart() {
    console.log('Basit bar chart başlatılıyor...');
    updateSimpleChart({ 
        votes: { 'ersin-tatar': 0, 'tufan-erhurman': 0, 'mehmet-hasguler': 1 },
        percentages: { 'ersin-tatar': 0, 'tufan-erhurman': 0, 'mehmet-hasguler': 100 }
    });
}

// Basit chart güncelle
function updateSimpleChart(data) {
    const { votes, percentages } = data;
    
    // Ersin Tatar
    const ersinVotes = votes['ersin-tatar'] || 0;
    const ersinPercent = percentages['ersin-tatar'] || 0;
    document.getElementById('bar-ersin').style.width = `${ersinPercent}%`;
    document.getElementById('value-ersin').textContent = `${ersinVotes} oy (${ersinPercent}%)`;
    
    // Tufan Erhürman
    const tufanVotes = votes['tufan-erhurman'] || 0;
    const tufanPercent = percentages['tufan-erhurman'] || 0;
    document.getElementById('bar-tufan').style.width = `${tufanPercent}%`;
    document.getElementById('value-tufan').textContent = `${tufanVotes} oy (${tufanPercent}%)`;
    
    // Mehmet Hasgüler
    const mehmetVotes = votes['mehmet-hasguler'] || 0;
    const mehmetPercent = percentages['mehmet-hasguler'] || 0;
    document.getElementById('bar-mehmet').style.width = `${mehmetPercent}%`;
    document.getElementById('value-mehmet').textContent = `${mehmetVotes} oy (${mehmetPercent}%)`;
}

// Grafiği güncelle (optimized with debounce)
function updateChart(data) {
    // Veri değişikliği kontrolü
    if (lastUpdateData && JSON.stringify(lastUpdateData) === JSON.stringify(data)) {
        return; // Aynı veri, güncelleme yapma
    }
    
    // Önceki timeout'u temizle
    if (chartUpdateTimeout) {
        clearTimeout(chartUpdateTimeout);
    }
    
    // Debounce ile chart güncelleme
    chartUpdateTimeout = setTimeout(() => {
        console.log('Chart güncelleniyor, gelen veri:', data);
        updateSimpleChart(data);
        lastUpdateData = JSON.parse(JSON.stringify(data)); // Deep copy
    }, 100); // 100ms debounce
}

// Geri sayım sayacını başlat
function startCountdown() {
    const electionDate = new Date('2025-10-19T08:00:00+03:00'); // KKTC saati
    
    function updateCountdown() {
        const now = new Date();
        const timeLeft = electionDate - now;
        
        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            
            document.getElementById('days').textContent = days;
            document.getElementById('hours').textContent = hours.toString().padStart(2, '0');
            document.getElementById('minutes').textContent = minutes.toString().padStart(2, '0');
            document.getElementById('seconds').textContent = seconds.toString().padStart(2, '0');
        } else {
            // Seçim tarihi geçti
            document.getElementById('days').textContent = '0';
            document.getElementById('hours').textContent = '00';
            document.getElementById('minutes').textContent = '00';
            document.getElementById('seconds').textContent = '00';
            
            disableVoting('Seçim süresi doldu');
        }
    }
    
    // İlk güncelleme
    updateCountdown();
    
    // Her saniye güncelle
    setInterval(updateCountdown, 1000);
}

// Mesaj göster
function showMessage(text, type = 'info') {
    const messageContainer = document.getElementById('message-container');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    
    messageContainer.appendChild(messageDiv);
    
    // 5 saniye sonra mesajı kaldır
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 5000);
}

// Sonuçları periyodik olarak güncelle
setInterval(loadResults, 30000); // 30 saniyede bir

// Sayfa kapatılırken uyarı (opsiyonel)
window.addEventListener('beforeunload', function(e) {
    if (selectedCandidate && !hasVoted) {
        e.preventDefault();
        e.returnValue = 'Oyunuzu henüz kullanmadınız. Sayfayı kapatmak istediğinizden emin misiniz?';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // ESC tuşu ile modal'ı kapat
    if (e.key === 'Escape') {
        hideVoteModal();
    }
    
    // Tab navigation için sayı tuşları
    if (e.key >= '1' && e.key <= '3') {
        const tabs = ['voting', 'security', 'info'];
        const tabIndex = parseInt(e.key) - 1;
        if (tabs[tabIndex]) {
            switchTab(tabs[tabIndex]);
        }
    }
});

// Touch events for mobile
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', function(e) {
    touchStartY = e.changedTouches[0].screenY;
});

document.addEventListener('touchend', function(e) {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartY - touchEndY;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Yukarı kaydırma - sonraki tab
            // Bu özellik isteğe bağlı olarak eklenebilir
        } else {
            // Aşağı kaydırma - önceki tab
            // Bu özellik isteğe bağlı olarak eklenebilir
        }
    }
}

// Performance monitoring
if ('performance' in window) {
    window.addEventListener('load', function() {
        setTimeout(function() {
            const perfData = performance.getEntriesByType('navigation')[0];
            console.log('Sayfa yükleme süresi:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
        }, 0);
    });
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript hatası:', e.error);
    showMessage('Bir hata oluştu. Sayfayı yenilemeyi deneyin.', 'error');
});

// Network status monitoring
window.addEventListener('online', function() {
    showMessage('İnternet bağlantısı yeniden kuruldu', 'success');
    loadResults();
});

window.addEventListener('offline', function() {
    showMessage('İnternet bağlantısı kesildi', 'error');
});