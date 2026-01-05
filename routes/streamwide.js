const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ═══════════════════════════════════════════════════════════
//                   🎬 STREAMWIDE DATABASE
// ═══════════════════════════════════════════════════════════

const StreamDB = {
    config: {
        baseUrl: 'https://120e0b2c-b7e9-466f-ba0f-8ca6c6d10dd6.streamwide.tv/api/v1/playlists/',
        concurrent: 50,
        syncInterval: 60 * 60 * 1000, // 1 ساعت
        dataFile: path.join(__dirname, '../data/streamwide_db.json')
    },

    db: {},
    meta: {
        totalCount: 0,
        lastSync: null,
        lastFullSync: null
    },
    autoSyncTimer: null,
    isDownloading: false,

    // ═══ لود از فایل ═══
    load() {
        try {
            if (fs.existsSync(this.config.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.dataFile, 'utf8'));
                this.db = data.db || {};
                this.meta = data.meta || { totalCount: 0, lastSync: null, lastFullSync: null };
                console.log(`📂 Loaded ${Object.keys(this.db).length} movies from cache`);
                return true;
            }
        } catch (e) {
            console.error('❌ Error loading DB:', e.message);
        }
        return false;
    },

    // ═══ ذخیره به فایل ═══
    save() {
        try {
            const data = { db: this.db, meta: this.meta };
            fs.writeFileSync(this.config.dataFile, JSON.stringify(data), 'utf8');
            console.log(`💾 Saved ${Object.keys(this.db).length} movies`);
        } catch (e) {
            console.error('❌ Error saving DB:', e.message);
        }
    },

    // ═══ ذخیره نتایج ═══
    saveResults(results) {
        for (const item of results) {
            if (item.imdb_id) {
                this.db[item.imdb_id] = {
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    description_fa: item.description_fa,
                    year: item.release_date ? item.release_date.split('-')[0] : null,
                    release_date: item.release_date,
                    type: item.type,
                    poster: item.poster,
                    genres: item.genres ? item.genres.map(g => g.name) : [],
                    ratings: item.ratings,
                    sources: item.sources_arguments
                };
            }
        }
    },

    // ═══════════════════════════════════════════════════════
    //                    🔽 دانلود کامل اولیه
    // ═══════════════════════════════════════════════════════

    async fullDownload() {
        if (this.isDownloading) {
            console.log('⚠️ Download already in progress');
            return null;
        }

        this.isDownloading = true;
        console.log('🚀 ═══════════════════════════════════════');
        console.log('   Starting full database download...');
        console.log('═══════════════════════════════════════════\n');

        const startTime = Date.now();

        try {
            // گرفتن اطلاعات اولیه
            const first = await axios.get(this.config.baseUrl, { timeout: 30000 });
            const perPage = first.data.results.length;
            const totalPages = Math.ceil(first.data.count / perPage);

            console.log(`📊 Total movies: ${first.data.count.toLocaleString()}`);
            console.log(`📄 Total pages: ${totalPages.toLocaleString()}`);
            console.log(`⚡ Concurrent: ${this.config.concurrent} requests\n`);

            this.db = {};
            this.meta.totalCount = first.data.count;

            // ذخیره صفحه اول
            this.saveResults(first.data.results);

            // دانلود بقیه صفحات
            for (let batch = 1; batch < totalPages; batch += this.config.concurrent) {
                const promises = [];
                const end = Math.min(batch + this.config.concurrent, totalPages);

                for (let page = batch + 1; page <= end + 1; page++) {
                    promises.push(
                        axios.get(`${this.config.baseUrl}?page=${page}`, { timeout: 30000 })
                            .then(r => r.data)
                            .catch(() => ({ results: [] }))
                    );
                }

                const responses = await Promise.all(promises);
                responses.forEach(data => this.saveResults(data.results || []));

                // نمایش پیشرفت
                const done = Math.min(batch + this.config.concurrent, totalPages);
                const percent = ((done / totalPages) * 100).toFixed(1);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                const moviesCount = Object.keys(this.db).length;

                console.log(`📄 ${done}/${totalPages} (${percent}%) | 🎬 ${moviesCount.toLocaleString()} movies | ⏱️ ${elapsed}s`);
            }

            // ذخیره نهایی
            this.meta.lastFullSync = new Date().toISOString();
            this.meta.lastSync = new Date().toISOString();
            this.save();

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
            const totalMovies = Object.keys(this.db).length;

            console.log('\n═══════════════════════════════════════════');
            console.log(`✅ Download complete!`);
            console.log(`🎬 ${totalMovies.toLocaleString()} movies saved`);
            console.log(`⏱️ Time: ${totalTime} seconds`);
            console.log('═══════════════════════════════════════════');

            this.isDownloading = false;
            return { success: true, count: totalMovies, time: totalTime };

        } catch (error) {
            console.error('❌ Full download error:', error.message);
            this.isDownloading = false;
            return { success: false, error: error.message };
        }
    },

    // ═══════════════════════════════════════════════════════
    //                  🔄 آپدیت فیلم‌های جدید
    // ═══════════════════════════════════════════════════════

    async syncNew() {
        console.log('🔄 ═══════════════════════════════════════');
        console.log('   Checking for new movies...');
        console.log('═══════════════════════════════════════════\n');

        this.load();

        if (!this.meta.lastSync) {
            console.log('⚠️ Database empty! Run fullDownload first');
            return { success: false, error: 'Database empty' };
        }

        const oldCount = this.meta.totalCount;
        const oldMovies = Object.keys(this.db).length;

        try {
            // چک تعداد جدید
            const first = await axios.get(this.config.baseUrl, { timeout: 30000 });
            const newCount = first.data.count;
            const diff = newCount - oldCount;

            console.log(`📊 Previous: ${oldCount.toLocaleString()} | New: ${newCount.toLocaleString()}`);

            // ذخیره صفحه اول (همیشه آپدیت کن)
            this.saveResults(first.data.results);

            if (diff <= 0) {
                console.log('✅ No new movies!');
                this.meta.lastSync = new Date().toISOString();
                this.meta.totalCount = newCount;
                this.save();
                return { success: true, newMovies: 0 };
            }

            console.log(`🆕 ${diff} new movies found!\n`);

            // صفحات اول رو چک کن تا به فیلم‌های قبلی برسیم
            const perPage = first.data.results.length;
            const pagesToCheck = Math.ceil(diff / perPage) + 5;

            let newMovies = 0;
            let foundExisting = false;

            for (let page = 2; page <= pagesToCheck && !foundExisting; page++) {
                const data = await axios.get(`${this.config.baseUrl}?page=${page}`, { timeout: 30000 });
                
                let existingCount = 0;
                for (const item of data.data.results || []) {
                    if (item.imdb_id) {
                        if (this.db[item.imdb_id]) {
                            existingCount++;
                        } else {
                            this.db[item.imdb_id] = {
                                id: item.id,
                                title: item.title,
                                description: item.description,
                                description_fa: item.description_fa,
                                year: item.release_date ? item.release_date.split('-')[0] : null,
                                release_date: item.release_date,
                                type: item.type,
                                poster: item.poster,
                                genres: item.genres ? item.genres.map(g => g.name) : [],
                                ratings: item.ratings,
                                sources: item.sources_arguments
                            };
                            newMovies++;
                        }
                    }
                }

                console.log(`📄 Page ${page}/${pagesToCheck} | 🆕 ${newMovies} new`);

                // اگه بیشتر از نصف صفحه قبلاً داشتیم، یعنی رسیدیم به آخر
                if (existingCount > perPage / 2) {
                    foundExisting = true;
                }
            }

            // ذخیره
            this.meta.totalCount = newCount;
            this.meta.lastSync = new Date().toISOString();
            this.save();

            console.log('\n═══════════════════════════════════════════');
            console.log(`✅ ${newMovies} new movies added!`);
            console.log(`🎬 Total: ${Object.keys(this.db).length.toLocaleString()} movies`);
            console.log('═══════════════════════════════════════════');

            return { success: true, newMovies };

        } catch (error) {
            console.error('❌ Sync error:', error.message);
            return { success: false, error: error.message };
        }
    },

    // ═══════════════════════════════════════════════════════
    //                  ⏰ آپدیت خودکار
    // ═══════════════════════════════════════════════════════

    startAutoSync(intervalHours = 1) {
        const interval = intervalHours * 60 * 60 * 1000;

        console.log(`⏰ Auto-sync every ${intervalHours} hour(s) enabled`);

        // توقف تایمر قبلی
        this.stopAutoSync();

        // تایمر جدید
        this.autoSyncTimer = setInterval(() => {
            console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Auto-sync...`);
            this.syncNew();
        }, interval);

        return `✅ Auto-sync every ${intervalHours} hour(s)`;
    },

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('⏹️ Auto-sync stopped');
        }
    },

    // ═══════════════════════════════════════════════════════
    //                    🔍 جستجو
    // ═══════════════════════════════════════════════════════

    find(imdbId) {
        this.load();
        
        // نرمال‌سازی IMDB ID
        let normalizedId = imdbId;
        if (!imdbId.startsWith('tt')) {
            normalizedId = 'tt' + imdbId;
        }

        return this.db[normalizedId] || null;
    },

    // جستجو با اسم
    search(query, limit = 20) {
        this.load();

        const results = [];
        const q = query.toLowerCase();

        for (const [imdb, item] of Object.entries(this.db)) {
            if (item.title?.toLowerCase().includes(q)) {
                results.push({ imdb, ...item });
            }
        }

        return results.slice(0, limit);
    },

    // ═══════════════════════════════════════════════════════
    //                    📊 آمار
    // ═══════════════════════════════════════════════════════

    stats() {
        this.load();
        
        const fileSize = fs.existsSync(this.config.dataFile) 
            ? (fs.statSync(this.config.dataFile).size / 1024 / 1024).toFixed(2) + ' MB'
            : '0 MB';

        return {
            totalMovies: Object.keys(this.db).length,
            totalCount: this.meta.totalCount,
            lastSync: this.meta.lastSync,
            lastFullSync: this.meta.lastFullSync,
            fileSize,
            autoSyncActive: !!this.autoSyncTimer
        };
    }
};

// ═══════════════════════════════════════════════════════════
//                  📺 گرفتن فصل‌های سریال از ویدیوها
// ═══════════════════════════════════════════════════════════

async function getSeriesSeasonsFromVideos(playlistId, token) {
    try {
        console.log(`📺 Getting seasons from videos for: ${playlistId}`);
        
        const response = await axios.get(`https://120e0b2c-b7e9-466f-ba0f-8ca6c6d10dd6.streamwide.tv/api/v1/playlists/videos/source/W/`, {
            params: { playlist: playlistId },
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
            },
            timeout: 15000,
        });
        
        const videos = response.data.videos || [];
        const seasonMap = new Map();
        
        // استخراج فصل‌ها از اسم فایل‌ها
        for (const video of videos) {
            const fileName = video.url?.split('/').pop() || video.file_name || '';
            const match = fileName.match(/S(\d{1,2})E\d{1,3}/i);
            if (match) {
                const seasonNum = parseInt(match[1]);
                if (!seasonMap.has(seasonNum)) {
                    seasonMap.set(seasonNum, playlistId); // همه از یه playlist میان
                }
            }
        }
        
        if (seasonMap.size === 0) {
            console.log(`⚠️ No seasons found in video names`);
            return { seasons: [], videos };
        }
        
        // ساختن لیست فصل‌ها
        const seasons = Array.from(seasonMap.keys())
            .sort((a, b) => a - b)
            .map(num => ({
                text: `فصل ${num}`,
                seasonNum: num,
                seasonId: playlistId // همه فصل‌ها از یه playlist میان
            }));
        
        console.log(`📺 Found ${seasons.length} seasons from video names`);
        return { seasons, videos };
    } catch (error) {
        console.error('Error getting seasons from videos:', error.message);
        return { seasons: [], videos: [] };
    }
}

// ═══════════════════════════════════════════════════════════
//                      🌐 API Routes
// ═══════════════════════════════════════════════════════════

// آمار
router.get('/stats', (req, res) => {
    res.json(StreamDB.stats());
});

// جستجو با IMDB ID
router.get('/find/:imdbId', (req, res) => {
    const item = StreamDB.find(req.params.imdbId);
    if (item) {
        res.json({ success: true, data: item });
    } else {
        res.json({ success: false, error: 'Not found' });
    }
});

// جستجو با اسم
router.get('/search', (req, res) => {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 20;
    
    if (!query) {
        return res.json({ success: false, error: 'Query required' });
    }

    const results = StreamDB.search(query, limit);
    res.json({ success: true, count: results.length, results });
});

// گرفتن فصل‌های سریال
router.get('/seasons/:playlistId', async (req, res) => {
    const seasons = await getSeriesSeasons(req.params.playlistId);
    res.json({ success: seasons.length > 0, seasons });
});

// دانلود کامل
router.post('/full-download', async (req, res) => {
    res.json({ message: 'Download started in background' });
    StreamDB.fullDownload();
});

// آپدیت
router.post('/sync', async (req, res) => {
    const result = await StreamDB.syncNew();
    res.json(result);
});

// شروع آپدیت خودکار
router.post('/auto-sync/start', (req, res) => {
    const hours = parseFloat(req.query.hours) || 1;
    const result = StreamDB.startAutoSync(hours);
    res.json({ success: true, message: result });
});

// توقف آپدیت خودکار
router.post('/auto-sync/stop', (req, res) => {
    StreamDB.stopAutoSync();
    res.json({ success: true, message: 'Auto-sync stopped' });
});

// ═══════════════════════════════════════════════════════════
//                      🚀 Initialize
// ═══════════════════════════════════════════════════════════

// لود دیتابیس و شروع auto-sync
StreamDB.load();

// اگه دیتابیس خالیه، دانلود کامل کن
if (Object.keys(StreamDB.db).length === 0) {
    console.log('📂 Database empty, starting full download...');
    StreamDB.fullDownload().then(() => {
        StreamDB.startAutoSync(1); // هر 1 ساعت
    });
} else {
    console.log(`📂 Loaded ${Object.keys(StreamDB.db).length} movies`);
    // شروع auto-sync
    StreamDB.startAutoSync(1);
    // یه sync اولیه هم بزن
    setTimeout(() => StreamDB.syncNew(), 5000);
}

module.exports = router;
module.exports.StreamDB = StreamDB;
module.exports.getSeriesSeasonsFromVideos = getSeriesSeasonsFromVideos;
