/* ==========================================================================
   1. Configuration & Promo (Branding)
   ========================================================================== */
const PROMO_CONFIG = {
    showBanner: true,
    text: "استكشف أحدث الألعاب والمنتجات الرقمية على ريشة!",
    buttonText: "زيارة المتجر",
    url: "https://www.risha.sa"
};

// Retro LCD Colors
const COLORS = {
    bg: '#9bbc0f',
    grid: '#8bac0f',
    dark: '#306230',
    black: '#0f380f'
};

const GRID_SIZE = 20; // 20x20 grid
const CELL_SIZE = 16; // 320 / 20 = 16px per cell

/* ==========================================================================
   2. Audio Engine (Soft Sine Waves, No External Files)
   ========================================================================== */
const AudioEngine = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    playTone(frequency, duration, vol = 0.5) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine'; // موجة ناعمة
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        // تلاشي فائق السرعة
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    eat() { this.playTone(400, 0.05, 0.5); },
    bonus() { this.playTone(600, 0.1, 0.5); setTimeout(() => this.playTone(800, 0.1, 0.5), 100); },
    bump() { this.playTone(150, 0.1, 0.8); }, // صوت ارتداد هادئ وخفيض
    win() { 
        [400, 500, 600, 800].forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.1, 0.5), i * 100);
        });
    }
};

/* ==========================================================================
   3. Storage Manager (LocalStorage)
   ========================================================================== */
const StorageManager = {
    key: 'retro_snake_save',
    load() {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : { unlocked: 1, levels: {} };
    },
    save(unlocked, levels) {
        localStorage.setItem(this.key, JSON.stringify({ unlocked, levels }));
    },
    reset() {
        localStorage.removeItem(this.key);
    }
};

/* ==========================================================================
   4. Level Data & Generator (20 Progressive Mazes)
   ========================================================================== */
const LEVELS_DATA = [];
// توليد 20 مرحلة بتصاميم وشروط نجاح مختلفة
for (let i = 1; i <= 20; i++) {
    LEVELS_DATA.push({
        id: i,
        targetScore: 5 + Math.floor(i * 1.5), // العدد المطلوب للثمار
        baseSpeed: Math.max(80, 160 - (i * 3)), // تزداد السرعة تدريجياً مع تقدم المراحل
        walls: generateLevelWalls(i)
    });
}

// دالة مساعدة لتوليد المتاهات برمجياً لمنع تضخم الكود
function generateLevelWalls(levelId) {
    const walls = [];
    const addWall = (x, y) => walls.push({x, y});
    
    // استراتيجيات وتصاميم مختلفة بناءً على رقم المرحلة
    if (levelId === 1) return walls; // مرحلة خالية
    
    if (levelId % 4 === 2) { // جدران محيطية
        for(let i=2; i<18; i++) { addWall(i, 2); addWall(i, 17); }
    }
    if (levelId % 4 === 3) { // متاهة متقاطعة
        for(let i=5; i<15; i++) { addWall(i, 10); addWall(10, i); }
    }
    if (levelId % 4 === 0) { // صناديق زوايا
        for(let i=2; i<7; i++) { addWall(i,2); addWall(2,i); addWall(17-i,17); addWall(17,17-i); }
    }
    if (levelId > 10) { // عقبات عشوائية ثابتة للمراحل المتقدمة
        let seed = levelId;
        for(let j=0; j<levelId; j++) {
            let wx = (seed * 13) % 18 + 1;
            let wy = (seed * 17) % 18 + 1;
            if(wx !== 10 && wy !== 10) addWall(wx, wy); // إبعاد الجدران عن نقطة البداية
            seed++;
        }
    }
    return walls;
}

/* ==========================================================================
   5. Game Engine
   ========================================================================== */
const GameEngine = {
    canvas: document.getElementById('game-canvas'),
    ctx: null,
    
    state: 'MENU', // MENU, PLAYING, PAUSED, GAME_OVER, LEVEL_CLEAR
    currentLevel: 1,
    saveData: StorageManager.load(),
    
    // Snake and Grid Variables
    snake: [],
    direction: {x: 1, y: 0},
    inputQueue: [], // منع الالتفاف المعاكس
    fruit: null,
    bonus: null,
    walls: [],
    
    // Stats & Timers
    score: 0,
    targetScore: 10,
    ticks: 0,
    startTime: 0,
    
    // Speed & Powerups
    baseTickRate: 150,
    currentTickRate: 150,
    lastTickTime: 0,
    animationId: null,
    
    ghostActive: false,
    ghostTimeout: null,
    
    init() {
        this.ctx = this.canvas.getContext('2d');
        this.setupPromo();
        this.bindEvents();
        this.renderMenu();
    },
    
    setupPromo() {
        if (PROMO_CONFIG.showBanner) {
            const banner = document.getElementById('promo-banner');
            document.getElementById('promo-text').innerText = PROMO_CONFIG.text;
            const link = document.getElementById('promo-link');
            link.innerText = PROMO_CONFIG.buttonText;
            link.href = PROMO_CONFIG.url;
            banner.classList.remove('hidden');
        }
    },
    
    bindEvents() {
        // لوحة المفاتيح
        window.addEventListener('keydown', (e) => {
            if (this.state !== 'PLAYING') return;
            const keyMap = {
                'ArrowUp': {x: 0, y: -1}, 'w': {x: 0, y: -1}, 'W': {x: 0, y: -1},
                'ArrowDown': {x: 0, y: 1}, 's': {x: 0, y: 1}, 'S': {x: 0, y: 1},
                'ArrowLeft': {x: -1, y: 0}, 'a': {x: -1, y: 0}, 'A': {x: -1, y: 0},
                'ArrowRight': {x: 1, y: 0}, 'd': {x: 1, y: 0}, 'D': {x: 1, y: 0}
            };
            if (keyMap[e.key]) {
                e.preventDefault();
                this.queueInput(keyMap[e.key]);
            }
        });

        // D-Pad Touch/Click
        const dpadMap = { 'd-up': {x:0, y:-1}, 'd-down': {x:0, y:1}, 'd-left': {x:-1, y:0}, 'd-right': {x:1, y:0} };
        for (let [id, dir] of Object.entries(dpadMap)) {
            const btn = document.getElementById(id);
            const handler = (e) => { e.preventDefault(); AudioEngine.init(); this.queueInput(dir); };
            btn.addEventListener('mousedown', handler);
            btn.addEventListener('touchstart', handler);
        }

        // Swipe Handling (السحب)
        let touchStartX = 0, touchStartY = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            AudioEngine.init();
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: false});
        
        this.canvas.addEventListener('touchend', (e) => {
            if (this.state !== 'PLAYING') return;
            e.preventDefault();
            let dx = e.changedTouches[0].screenX - touchStartX;
            let dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
                this.queueInput({x: dx > 0 ? 1 : -1, y: 0});
            } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) {
                this.queueInput({x: 0, y: dy > 0 ? 1 : -1});
            }
        }, {passive: false});

        // System Buttons
        document.getElementById('btn-start').addEventListener('click', () => {
            AudioEngine.init();
            if(this.state === 'MENU' || this.state === 'GAME_OVER' || this.state === 'LEVEL_CLEAR') {
                this.startLevel(this.currentLevel);
            }
        });
        
        document.getElementById('btn-pause').addEventListener('click', () => {
            AudioEngine.init();
            if(this.state === 'PLAYING') {
                this.state = 'PAUSED';
                this.showMessage('إيقاف مؤقت', 'اضغط متابعة للعودة', true);
            }
        });
        
        document.getElementById('btn-reset-progress').addEventListener('click', () => {
            AudioEngine.init();
            if (confirm("تحذير: سيتم مسح جميع النجوم والمراحل المفتوحة. هل أنت متأكد؟")) {
                StorageManager.reset();
                this.saveData = StorageManager.load();
                this.renderMenu();
            }
        });

        // Overlay Buttons
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            AudioEngine.init();
            document.getElementById('message-overlay').classList.add('hidden');
            this.renderMenu();
        });
        
        document.getElementById('btn-next-action').addEventListener('click', () => {
            AudioEngine.init();
            document.getElementById('message-overlay').classList.add('hidden');
            if (this.state === 'PAUSED') {
                this.state = 'PLAYING';
                this.lastTickTime = performance.now();
                this.loop(performance.now());
            } else if (this.state === 'LEVEL_CLEAR') {
                this.currentLevel = Math.min(20, this.currentLevel + 1);
                this.startLevel(this.currentLevel);
            } else if (this.state === 'GAME_OVER') {
                this.startLevel(this.currentLevel);
            }
        });
    },
    
    queueInput(newDir) {
        // منع الانعطاف الذاتي والالتفاف المعاكس
        const lastDir = this.inputQueue.length > 0 ? this.inputQueue[this.inputQueue.length - 1] : this.direction;
        if (newDir.x !== 0 && lastDir.x === -newDir.x) return;
        if (newDir.y !== 0 && lastDir.y === -newDir.y) return;
        
        if(this.inputQueue.length < 2) {
            this.inputQueue.push(newDir);
        }
    },
    
    renderMenu() {
        this.state = 'MENU';
        if(this.animationId) cancelAnimationFrame(this.animationId);
        
        // التعديل هنا: إزالة class "hidden" بشكل صريح بدلاً من إضافة "active"
        document.getElementById('menu-overlay').classList.remove('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        
        const grid = document.getElementById('level-select-grid');
        grid.innerHTML = '';
        
        LEVELS_DATA.forEach(level => {
            const btn = document.createElement('button');
            btn.className = 'level-btn';
            btn.innerText = level.id;
            
            const isUnlocked = level.id <= this.saveData.unlocked;
            if (!isUnlocked) {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => {
                    AudioEngine.init();
                    this.startLevel(level.id);
                });
                
                // عرض النجوم إن وجدت
                const starsCount = this.saveData.levels[level.id] || 0;
                if (starsCount > 0) {
                    const starsDiv = document.createElement('div');
                    starsDiv.className = 'level-stars';
                    starsDiv.innerText = '★'.repeat(starsCount) + '☆'.repeat(3 - starsCount);
                    btn.appendChild(starsDiv);
                }
            }
            grid.appendChild(btn);
        });
        
        this.clearCanvas();
    },
    
    startLevel(levelId) {
        this.currentLevel = levelId;
        const levelData = LEVELS_DATA.find(l => l.id === levelId);
        
        // إعادة ضبط المتغيرات
        this.snake = [ {x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10} ];
        this.direction = {x: 1, y: 0};
        this.inputQueue = [];
        this.score = 0;
        this.targetScore = levelData.targetScore;
        this.baseTickRate = levelData.baseTickRate;
        this.currentTickRate = this.baseTickRate;
        this.walls = levelData.walls;
        this.ghostActive = false;
        if(this.ghostTimeout) clearTimeout(this.ghostTimeout);
        this.startTime = Date.now();
        
        this.spawnFruit();
        this.bonus = null;
        
        // تحديث الواجهة
        document.getElementById('hud-level').innerText = levelId;
        this.updateHUD();
        
        // التعديل هنا: إضافة class "hidden" بشكل صريح بدلاً من إزالة "active"
        document.getElementById('menu-overlay').classList.add('hidden');
        document.getElementById('message-overlay').classList.add('hidden');
        
        this.state = 'PLAYING';
        this.lastTickTime = performance.now();
        this.loop(performance.now());
    },
    
    spawnFruit() {
        let valid = false;
        while (!valid) {
            this.fruit = {
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE)
            };
            valid = this.isCellEmpty(this.fruit.x, this.fruit.y);
        }
    },
    
    spawnBonus() {
        let valid = false;
        while (!valid) {
            this.bonus = {
                x: Math.floor(Math.random() * GRID_SIZE),
                y: Math.floor(Math.random() * GRID_SIZE),
                type: Math.random() > 0.5 ? 'GHOST' : 'SLOW'
            };
            valid = this.isCellEmpty(this.bonus.x, this.bonus.y);
        }
        // إخفاء المكافأة بعد 6 ثواني إذا لم تؤكل
        setTimeout(() => { if (this.state === 'PLAYING') this.bonus = null; }, 6000);
    },
    
    isCellEmpty(x, y) {
        const inSnake = this.snake.some(s => s.x === x && s.y === y);
        const inWall = this.walls.some(w => w.x === x && w.y === y);
        const inFruit = this.fruit && this.fruit.x === x && this.fruit.y === y;
        return !inSnake && !inWall && !inFruit;
    },
    
    loop(timestamp) {
        if (this.state !== 'PLAYING') return;
        
        this.animationId = requestAnimationFrame((ts) => this.loop(ts));
        
        const delta = timestamp - this.lastTickTime;
        if (delta >= this.currentTickRate) {
            this.update();
            this.lastTickTime = timestamp;
        }
        
        this.draw();
    },
    
    update() {
        if (this.inputQueue.length > 0) {
            this.direction = this.inputQueue.shift();
        }
        
        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;
        
        // الالتفاف حول الشاشة (Wrap Around)
        if (head.x < 0) head.x = GRID_SIZE - 1;
        else if (head.x >= GRID_SIZE) head.x = 0;
        
        if (head.y < 0) head.y = GRID_SIZE - 1;
        else if (head.y >= GRID_SIZE) head.y = 0;
        
        // التحقق من الاصطدام
        if (this.checkCollision(head)) {
            AudioEngine.bump();
            this.gameOver();
            return;
        }
        
        this.snake.unshift(head); // تحريك الرأس
        
        // أكل الثمرة العادية
        if (head.x === this.fruit.x && head.y === this.fruit.y) {
            AudioEngine.eat();
            this.score++;
            this.updateHUD();
            
            // التسارع الذكي بنسبة 20% عند بقاء ثمرة واحدة فقط
            if (this.score === this.targetScore - 1) {
                this.currentTickRate = this.baseTickRate * 0.8;
            }
            
            if (this.score >= this.targetScore) {
                this.levelClear();
                return;
            }
            
            this.spawnFruit();
            // فرصة 10% لظهور جائزة مؤقتة
            if (Math.random() > 0.9 && !this.bonus) {
                this.spawnBonus();
            }
        } else {
            this.snake.pop(); // حذف الذيل إذا لم يأكل
        }
        
        // أكل الجائزة (البونص)
        if (this.bonus && head.x === this.bonus.x && head.y === this.bonus.y) {
            AudioEngine.bonus();
            if (this.bonus.type === 'GHOST') {
                this.ghostActive = true;
                if(this.ghostTimeout) clearTimeout(this.ghostTimeout);
                // تدوم 3 ثوانٍ فقط (شرط صارم)
                this.ghostTimeout = setTimeout(() => {
                    this.ghostActive = false;
                    // التحقق إذا انتهى الشبح داخل جدار للقتل الفوري
                    if(this.state === 'PLAYING' && this.walls.some(w => w.x === this.snake[0].x && w.y === this.snake[0].y)) {
                        AudioEngine.bump();
                        this.gameOver();
                    }
                }, 3000);
            } else if (this.bonus.type === 'SLOW') {
                this.currentTickRate = this.baseTickRate * 1.5;
                setTimeout(() => { if (this.state === 'PLAYING') this.currentTickRate = this.score === this.targetScore - 1 ? this.baseTickRate * 0.8 : this.baseTickRate; }, 5000);
            }
            this.bonus = null;
        }
    },
    
    checkCollision(head) {
        // الاصطدام بالذيل
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) return true;
        }
        // الاصطدام بالجدران (يتعطل أثناء وضع الشبح)
        if (!this.ghostActive) {
            for (let wall of this.walls) {
                if (head.x === wall.x && head.y === wall.y) return true;
            }
        }
        return false;
    },
    
    clearCanvas() {
        this.ctx.fillStyle = COLORS.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // رسم شبكة خفيفة (LCD Grid)
        this.ctx.strokeStyle = COLORS.grid;
        this.ctx.lineWidth = 1;
        for(let i=0; i<GRID_SIZE; i++) {
            for(let j=0; j<GRID_SIZE; j++) {
                this.ctx.strokeRect(i * CELL_SIZE, j * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    },
    
    draw() {
        this.clearCanvas();
        
        // رسم الجدران
        this.ctx.fillStyle = COLORS.dark;
        this.walls.forEach(w => {
            this.ctx.fillRect(w.x * CELL_SIZE + 1, w.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        });
        
        // رسم الثمرة
        if (this.fruit) {
            this.ctx.fillStyle = COLORS.black;
            this.ctx.beginPath();
            this.ctx.arc(this.fruit.x * CELL_SIZE + CELL_SIZE/2, this.fruit.y * CELL_SIZE + CELL_SIZE/2, CELL_SIZE/2 - 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // رسم الجوائز
        if (this.bonus) {
            this.ctx.fillStyle = COLORS.black;
            if (this.bonus.type === 'GHOST') {
                this.ctx.strokeRect(this.bonus.x * CELL_SIZE + 2, this.bonus.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4); // مربع مفرغ
            } else {
                this.ctx.fillRect(this.bonus.x * CELL_SIZE + 4, this.bonus.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8); // مربع صغير
            }
        }
        
        // رسم الثعبان
        this.snake.forEach((segment, index) => {
            // تأثير وميض للثعبان في وضع الشبح
            if (this.ghostActive && index > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
                this.ctx.fillStyle = COLORS.grid; 
            } else {
                this.ctx.fillStyle = index === 0 ? COLORS.black : COLORS.dark;
            }
            
            this.ctx.fillRect(segment.x * CELL_SIZE + 1, segment.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            
            // عيون للرأس
            if (index === 0) {
                this.ctx.fillStyle = COLORS.bg;
                this.ctx.fillRect(segment.x * CELL_SIZE + 3, segment.y * CELL_SIZE + 3, 2, 2);
                this.ctx.fillRect(segment.x * CELL_SIZE + 11, segment.y * CELL_SIZE + 3, 2, 2);
            }
        });
    },
    
    updateHUD() {
        document.getElementById('hud-score').innerText = this.score;
        document.getElementById('hud-target').innerText = `${this.score}/${this.targetScore}`;
    },
    
    gameOver() {
        this.state = 'GAME_OVER';
        this.showMessage('انتهت اللعبة', 'لقد اصطدمت!', false);
    },
    
    levelClear() {
        this.state = 'LEVEL_CLEAR';
        AudioEngine.win();
        
        // حساب النجوم بناءً على الوقت المنقضي
        const timeTaken = (Date.now() - this.startTime) / 1000;
        let stars = 1;
        const parTime = this.targetScore * 3; // 3 ثواني لكل ثمرة كمتوسط ممتاز
        if (timeTaken <= parTime) stars = 3;
        else if (timeTaken <= parTime * 1.5) stars = 2;
        
        // الحفظ
        const nextLevel = this.currentLevel + 1;
        if (nextLevel > this.saveData.unlocked && nextLevel <= 20) {
            this.saveData.unlocked = nextLevel;
        }
        
        const currentStars = this.saveData.levels[this.currentLevel] || 0;
        if (stars > currentStars) {
            this.saveData.levels[this.currentLevel] = stars;
        }
        
        StorageManager.save(this.saveData.unlocked, this.saveData.levels);
        
        const starText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        this.showMessage('تم إنجاز المرحلة!', `حصلت على ${stars} نجوم\n${starText}`, true);
    },
    
    showMessage(title, text, showNextBtn) {
        document.getElementById('message-title').innerText = title;
        document.getElementById('message-text').innerText = text;
        document.getElementById('message-stars').innerText = ''; // تفريغ النجوم
        
        const nextBtn = document.getElementById('btn-next-action');
        if (showNextBtn) {
            nextBtn.style.display = 'block';
            nextBtn.innerText = this.state === 'PAUSED' ? 'متابعة' : 'المرحلة التالية';
        } else {
            nextBtn.style.display = 'block';
            nextBtn.innerText = 'إعادة المحاولة';
        }
        
        document.getElementById('message-overlay').classList.remove('hidden');
    }
};

// تهيئة اللعبة عند اكتمال تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    GameEngine.init();
});
