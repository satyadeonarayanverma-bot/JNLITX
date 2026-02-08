// ApiManager and AnalysisEngine expected in global scope

// Simple Event Bus
const EventBus = new EventTarget();

// State
const State = {
    horizon: 'short',
    marketData: [],
    newsData: [],
    analysisResult: null,
    selectedCoin: null,
    lastUpdate: null
};

// Services
const apiManager = new ApiManager();
const analysisEngine = new AnalysisEngine();

// DOM Elements
const els = {
    horizonBtns: document.querySelectorAll('.toggle-btn'),
    toggleIndicator: document.querySelector('.toggle-indicator'),
    marketList: document.getElementById('market-list'),
    suggestions: {
        best: document.getElementById('suggestions-best'),
        avoid: document.getElementById('suggestions-avoid'),
        trump: document.getElementById('suggestions-trump')
    },
    views: {
        dashboard: document.getElementById('dashboard-view'),
        detail: document.getElementById('detail-view'),
        explanation: document.getElementById('explanation-view')
    },
    backBtns: document.querySelectorAll('.back-btn'),
    detailContent: document.getElementById('detail-content'),
    lastUpdate: document.getElementById('last-update-time')
};

// --- Initialization ---

async function init() {
    console.log("MONASPECT Initializing...");

    // Bind Events
    els.horizonBtns.forEach(btn => {
        btn.addEventListener('click', (e) => setHorizon(e.target.dataset.horizon));
    });

    els.backBtns.forEach(btn => {
        btn.addEventListener('click', () => closeOverlays());
    });

    // Initial Load
    await updateData();

    // Periodic Update (15 mins)
    setInterval(updateData, 15 * 60 * 1000);
}

// --- Logic ---

function setHorizon(horizon) {
    if (State.horizon === horizon) return;
    State.horizon = horizon;

    // Update UI Toggle
    els.horizonBtns.forEach(btn => {
        if (btn.dataset.horizon === horizon) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Animate Indicator
    const activeBtn = document.querySelector(`.toggle-btn[data-horizon="${horizon}"]`);
    els.toggleIndicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`; // Simplification, better with flex logic

    // In flex value: Short is left (0), Long is right (100%)
    els.toggleIndicator.style.transform = horizon === 'short' ? 'translateX(0)' : 'translateX(100%)';

    // Rerunning Analysis with new horizon
    analysisEngine.setHorizon(horizon);
    runAnalysis();
}

async function updateData() {
    // Show loading state if needed?
    // els.lastUpdate.textContent = "Updating...";

    try {
        const data = await apiManager.refreshAll();
        State.marketData = data.market;
        State.newsData = data.news;
        State.lastUpdate = new Date();

        els.lastUpdate.textContent = State.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        runAnalysis();
    } catch (e) {
        console.error("Update failed", e);
        els.lastUpdate.textContent = "Update Failed. Retrying...";
    }
}

function runAnalysis() {
    State.analysisResult = analysisEngine.analyze(State.marketData, State.newsData);
    renderDashboard();
}

// --- Rendering ---

function renderDashboard() {
    if (!State.analysisResult) return;

    const { best, avoid, trump, all } = State.analysisResult;

    // 1. Render Suggestions
    renderSuggestionCards(best, els.suggestions.best, 'best');
    renderSuggestionCards(avoid, els.suggestions.avoid, 'avoid');
    renderSuggestionCards(trump, els.suggestions.trump, 'trump');

    // 2. Render Market List
    renderMarketList(all);
}

function renderSuggestionCards(assets, container, type) {
    container.innerHTML = '';
    assets.forEach((asset, index) => {
        const card = document.createElement('div');
        card.className = `suggestion-card ${type}-card fade-in delay-${index + 1}`;

        // Color for mini-score
        const scoreClass = asset.scores.favorability > 0.3 ? 'score-high' : asset.scores.favorability < -0.3 ? 'score-low' : 'score-med';

        card.innerHTML = `
            <div class="coin-symbol">${asset.symbol}</div>
            <div class="coin-price">$${formatPrice(asset.price)}</div>
            <div class="mini-score ${scoreClass}">Score: ${asset.scores.favorability.toFixed(1)}</div>
        `;

        card.addEventListener('click', () => openDetail(asset));
        container.appendChild(card);
    });
}

function renderMarketList(assets) {
    els.marketList.innerHTML = '';
    assets.slice(0, 20).forEach((asset, index) => { // Top 20 only
        const row = document.createElement('div');
        row.className = 'market-row fade-in';
        row.style.animationDelay = `${index * 0.05}s`;

        const changeClass = asset.change24h >= 0 ? 'change-up' : 'change-down';
        const changeSign = asset.change24h >= 0 ? '+' : '';

        row.innerHTML = `
            <div class="market-row-left">
                <span class="coin-rank">${index + 1}</span>
                <div class="row-names">
                    <span class="row-symbol">${asset.symbol}</span>
                    <span class="row-name">${asset.name}</span>
                </div>
            </div>
            <div class="market-row-right">
                <span class="row-price">$${formatPrice(asset.price)}</span>
                <span class="row-change ${changeClass}">${changeSign}${asset.change24h.toFixed(2)}%</span>
            </div>
        `;

        row.addEventListener('click', () => openDetail(asset));
        els.marketList.appendChild(row);
    });
}

// --- Navigation & Details ---

// --- GRAPH ENGINE (Canvas-Based Premium) ---

class GraphEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.details = { symbol: '', timeframe: '1D' };
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.isDragging = false;
        this.crosshairX = -1;

        // Interaction Bindings
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchend', () => { this.crosshairX = -1; this.draw(); });
        this.canvas.addEventListener('mousemove', (e) => this.handleMouse(e));
        this.canvas.addEventListener('mouseleave', () => { this.crosshairX = -1; this.draw(); });
    }

    loadData(data, symbol, timeframe) {
        this.data = data;
        this.details = { symbol, timeframe };
        this.draw();
    }

    handleTouch(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        this.crosshairX = touch.clientX - rect.left;
        this.draw();
        this.drawCrosshair(this.crosshairX);
    }

    handleMouse(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.crosshairX = e.clientX - rect.left;
        this.draw();
        this.drawCrosshair(this.crosshairX);
    }

    draw() {
        if (!this.data || this.data.length < 2) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        const prices = this.data.map(d => d.price);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = maxP - minP || 1;

        const padTop = 30; // More room for glow
        const padBtm = 30;
        const drawH = h - padTop - padBtm;

        const getY = (p) => h - padBtm - ((p - minP) / range) * drawH;
        const stepX = w / (this.data.length - 1);
        const getX = (i) => i * stepX;

        // Dynamic Color
        const startPrice = this.data[0].price;
        const endPrice = this.data[this.data.length - 1].price;
        const isUp = endPrice >= startPrice;
        const color = isUp ? '0, 255, 157' : '255, 0, 85';

        // Gradient Fill
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(${color}, 0.25)`);
        grad.addColorStop(1, `rgba(${color}, 0.0)`);

        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, getY(this.data[0].price));

        // Spline Curve
        for (let i = 0; i < this.data.length - 1; i++) {
            const x1 = getX(i);
            const y1 = getY(this.data[i].price);
            const x2 = getX(i + 1);
            const y2 = getY(this.data[i + 1].price);

            const xc = (x1 + x2) / 2;
            const yc = (y1 + y2) / 2;
            ctx.quadraticCurveTo(x1, y1, xc, yc);
        }
        const iLast = this.data.length - 1;
        ctx.lineTo(getX(iLast), getY(this.data[iLast].price));
        ctx.lineTo(w, h);
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke Line
        ctx.beginPath();
        ctx.moveTo(0, getY(this.data[0].price));

        for (let i = 0; i < this.data.length - 1; i++) {
            const x1 = getX(i);
            const y1 = getY(this.data[i].price);
            const x2 = getX(i + 1);
            const y2 = getY(this.data[i + 1].price);
            const xc = (x1 + x2) / 2;
            const yc = (y1 + y2) / 2;
            ctx.quadraticCurveTo(x1, y1, xc, yc);
        }
        ctx.lineTo(getX(iLast), getY(this.data[iLast].price));

        ctx.strokeStyle = `rgb(${color})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = `rgb(${color})`;
        ctx.shadowBlur = 15; // Bloom
        ctx.stroke();

        ctx.shadowBlur = 0;

        // End Dot (Pulsing)
        if (this.crosshairX < 0) {
            const lx = getX(iLast);
            const ly = getY(this.data[iLast].price);

            ctx.beginPath();
            ctx.arc(lx, ly, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(lx, ly, 12, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color}, 0.3)`;
            ctx.fill();
        }
    }

    drawCrosshair(x) {
        if (x < 0 || x > this.width) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        const stepX = w / (this.data.length - 1);
        const idx = Math.min(this.data.length - 1, Math.max(0, Math.round(x / stepX)));
        const point = this.data[idx];
        const px = idx * stepX;

        // Vertical Line
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price Point
        const prices = this.data.map(d => d.price);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = maxP - minP || 1;
        const drawH = h - 60; // adjust for padding
        const py = h - 30 - ((point.price - minP) / range) * drawH;

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Tooltip
        const text = `$${point.price.toFixed(2)}`;
        // Determine date format based on timeframe
        const isIntraday = ['LIVE', '1D'].includes(this.details.timeframe);
        const dateStr = isIntraday
            ? new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(point.time).toLocaleDateString([], { month: 'short', day: 'numeric' });

        const pad = 10;
        ctx.font = 'bold 12px Inter, sans-serif';
        const tw = ctx.measureText(text + " " + dateStr).width + 20;

        let tx = px - tw / 2;
        if (tx < 10) tx = 10;
        if (tx + tw > w - 10) tx = w - tw - 10;

        // Tooltip BG
        ctx.fillStyle = 'rgba(20, 20, 20, 0.95)';
        ctx.roundRect(tx, 10, tw, 30, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();

        // Text
        ctx.fillStyle = '#fff';
        ctx.fillText(`${dateStr}  |  ${text}`, tx + 10, 30);
    }
}

// --- MAIN LOGIC EXTENSIONS ---

let graphEngine = null;
let currentDetailAsset = null;

// --- Navigation & Details ---

function openDetail(asset) {
    State.selectedCoin = asset;
    currentDetailAsset = asset;

    // Populate Detail View
    document.getElementById('detail-coin-name').textContent = asset.name;
    const analysis = asset.analysis;

    // Render HTML
    const content = els.detailContent;
    content.innerHTML = `
        <div class="price-hero">
            <h1 class="hero-price">$${formatPrice(asset.price)}</h1>
            <span class="hero-change ${asset.change24h >= 0 ? 'change-up' : 'change-down'}">
                ${asset.change24h >= 0 ? '▲' : '▼'} ${Math.abs(asset.change24h).toFixed(2)}% (24h)
            </span>
        </div>

        <!-- Premium Graph Controls -->
        <div class="graph-toggles">
            <button class="g-tog active" onclick="updateGraphTimeframe('LIVE')">LIVE</button>
            <button class="g-tog" onclick="updateGraphTimeframe('1D')">1D</button>
            <button class="g-tog" onclick="updateGraphTimeframe('1W')">1W</button>
            <button class="g-tog" onclick="updateGraphTimeframe('1M')">1M</button>
            <button class="g-tog" onclick="updateGraphTimeframe('1Y')">1Y</button>
        </div>

        <div class="chart-container" id="main-chart-wrapper">
            <canvas id="premium-chart" style="width:100%; height:100%;"></canvas>
        </div>

        <div class="analysis-card mt-4">
            <h3>Expert Analysis</h3>
            <p>${analysis.summary}</p>
            <div class="metric-grid">
                <div class="metric">
                    <label>Vol. Regime</label>
                    <span>${asset.scores.risk > 0.5 ? 'High' : 'Low'}</span>
                </div>
                <div class="metric">
                    <label>Confidence</label>
                    <span>${analysis.confidence}</span>
                </div>
            </div>
        </div>

        <div class="analysis-card mt-2">
             <h3>Key Scenarios</h3>
             <p class="text-sm text-secondary">
                ${analysis.sections[6].content}
            </p>
        </div>

        <button id="view-explanation-btn" class="action-btn mt-4">
            Read Full Analyst Briefing
        </button>
    `;

    // Bind sub-button
    document.getElementById('view-explanation-btn').addEventListener('click', () => openExplanation(asset));

    // Initialize Graph (Delayed for DOM paint)
    setTimeout(async () => {
        // ALWAYS create a new engine instance because the canvas element is new
        if (graphEngine) {
            // Optional: destroy old instance or remove listeners if implemented
            graphEngine = null;
        }
        graphEngine = new GraphEngine('premium-chart');

        // Load default 1D data
        updateGraphTimeframe('1D');
    }, 50);

    // Show View
    els.views.detail.classList.add('active');
}

// Exposed globally for onclick in HTML logic (common pattern for vanilla apps)
window.updateGraphTimeframe = async function (tf) {
    if (!currentDetailAsset || !graphEngine) return;

    // UI Update
    document.querySelectorAll('.g-tog').forEach(b => {
        b.classList.toggle('active', b.textContent === tf);
    });

    // Data Fetch
    const history = await apiManager.fetchHistory(currentDetailAsset.symbol, tf);
    graphEngine.loadData(history, currentDetailAsset.symbol, tf);
};

function openExplanation(asset) {
    const analysis = asset.analysis;
    const expContent = document.getElementById('explanation-content');

    // 10-Section Render
    let html = '';
    analysis.sections.forEach((sec, idx) => {
        html += `
            <div class="ex-section fade-in delay-${idx % 3}">
                <h2>${idx + 1}. ${sec.title}</h2>
                <div class="ex-content">
                    <p>${sec.content}</p>
                </div>
            </div>
            <hr class="ex-divider">
        `;
    });

    expContent.innerHTML = html;
    els.views.explanation.classList.add('active');
}

function closeOverlays() {
    if (els.views.explanation.classList.contains('active')) {
        els.views.explanation.classList.remove('active');
    } else {
        els.views.detail.classList.remove('active');
        State.selectedCoin = null;
    }
}

// --- Utilities ---

function formatPrice(p) {
    p = parseFloat(p);
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return Math.floor(p).toLocaleString();
}

function formatVolume(v) {
    if (v > 1000000000) return (v / 1000000000).toFixed(2) + 'B';
    if (v > 1000000) return (v / 1000000).toFixed(2) + 'M';
    return v.toLocaleString();
}

// Start
document.addEventListener('DOMContentLoaded', init);
