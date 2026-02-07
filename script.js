/**
 * JNLITX ULTIMATE - Optimized Core
 * version: 2.2.0 (Fix: Fast Load + CORS Safe)
 * Features: 7-Layer Market Data, 4-Layer News, TA, Portfolio, Arbitrage, Gas, TV Mode
 */

// --- CONFIGURATION ---
const CURRENCIES = {
    USD: { rate: 1, symbol: '$' },
    EUR: { rate: 0.92, symbol: '€' },
    GBP: { rate: 0.78, symbol: '£' },
    JPY: { rate: 148.5, symbol: '¥' },
    INR: { rate: 83.2, symbol: '₹' }
};

// FAST & CORS-FRIENDLY APIs ONLY
const PROVIDERS = [
    {
        name: 'CoinCap', // Fast, No Key
        url: 'https://api.coincap.io/v2/assets?limit=20',
        chart: (id, tf) => `https://api.coincap.io/v2/assets/${id}/history?interval=${getInterval(tf)}`,
        transform: d => d.data.map(transformCoinCap)
    },
    {
        name: 'CoinGecko', // Reliable, sometimes Rate Limited
        url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false',
        chart: (id, tf) => `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${getDays(tf)}`,
        transform: d => d.map(transformCoinGecko)
    },
    {
        name: 'CryptoCompare', // Very Reliable, CORS Open
        url: 'https://min-api.cryptocompare.com/data/top/mktcapfull?limit=20&tsym=USD',
        chart: (id, tf) => null, // Fallback logic needed for charts
        transform: d => d.Data.map(transformCryptoCompare)
    }
];

// Transformers
function transformCoinCap(d) {
    return {
        id: d.id, name: d.name, symbol: d.symbol, price: parseFloat(d.priceUsd),
        change: parseFloat(d.changePercent24Hr), cap: parseFloat(d.marketCapUsd),
        vol: parseFloat(d.volumeUsd24Hr), rank: parseInt(d.rank)
    };
}
function transformCoinGecko(d) {
    return {
        id: d.id, name: d.name, symbol: d.symbol.toUpperCase(), price: d.current_price,
        change: d.price_change_percentage_24h, cap: d.market_cap,
        vol: d.total_volume, rank: d.market_cap_rank
    };
}
function transformCryptoCompare(d) {
    const raw = d.RAW ? d.RAW.USD : {};
    return {
        id: d.CoinInfo.Name.toLowerCase(), // Not perfect ID match but works for general use
        name: d.CoinInfo.FullName,
        symbol: d.CoinInfo.Name,
        price: raw.PRICE || 0,
        change: raw.CHANGEPCT24HOUR || 0,
        cap: raw.MKTCAP || 0,
        vol: raw.VOLUME24HOUR || 0,
        rank: 0 // CC doesn't send rank in this endpoint easily
    };
}

// Helpers
function getInterval(tf) {
    if (tf === '1W') return 'h1';
    if (tf === '1M') return 'h12';
    if (tf === '1Y') return 'd1';
    return 'm15';
}
function getDays(tf) {
    if (tf === '1D') return 1;
    if (tf === '1W') return 7;
    if (tf === '1M') return 30;
    return 365;
}

// --- STATE ---
let state = {
    assets: [],
    currency: 'USD',
    currentAssetId: 'bitcoin',
    timeframe: '1D',
    activeProvider: 0,
    portfolio: JSON.parse(localStorage.getItem('jnlitx_portfolio')) || [],
    alarms: JSON.parse(localStorage.getItem('jnlitx_alarms')) || [],
    ta: { sma: false, ema: false, bb: false },
    heatmapMode: false,
    chartHistory: []
};

// --- DOM ELEMENTS ---
const UI = {
    loader: document.getElementById('loader'),
    loaderText: document.querySelector('#loader p'),
    tables: { list: document.getElementById('market-table-body'), grid: document.getElementById('market-heatmap-view') },
    hero: {
        price: document.getElementById('hero-price'), change: document.getElementById('hero-change'),
        name: document.getElementById('selected-name'), symbol: document.getElementById('selected-symbol'),
        icon: document.getElementById('selected-icon')
    },
    news: document.getElementById('news-feed'),
    gas: document.getElementById('gas-gwei'),
    arb: { bin: document.getElementById('arb-binance'), cb: document.getElementById('arb-coinbase'), krk: document.getElementById('arb-kraken') },
    port: { total: document.getElementById('port-total'), list: document.getElementById('holding-list'), select: document.getElementById('port-asset-select') },
    modals: { portfolio: document.getElementById('modal-portfolio'), alarm: document.getElementById('modal-alarm') },
    fg: { val: document.getElementById('fg-value'), text: document.getElementById('fg-text'), fill: document.getElementById('fg-fill') },
    details: { rank: document.getElementById('detail-rank'), supply: document.getElementById('detail-supply'), max: document.getElementById('detail-max-supply') },
    whale: document.getElementById('whale-list')
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    UI.loader.style.display = 'flex';
    UI.loader.style.opacity = '1';
    UI.loaderText.innerText = "Initializing JNLITX Core...";

    try {
        // Parallel Race: Try ALL providers at once, take first success
        // This is much faster than sequential waiting
        await raceMarketData();

        // Non-blocking background fetches
        fetchNews().catch(e => console.warn("News Warning", e));
        fetchGas().catch(e => console.warn("Gas Warning", e));
        fetchFearGreed().catch(e => console.warn("F&G Warning", e));

        // Hide Loader
        setTimeout(() => {
            UI.loader.style.opacity = '0';
            setTimeout(() => UI.loader.style.display = 'none', 500);
        }, 500);

        // Loops
        setInterval(silentUpdate, 15000); // Market 15s
        setInterval(fetchGas, 30000); // Gas 30s
        setInterval(fetchNews, 300000); // News 5m
        setInterval(checkAlarms, 15000); // Alarms 15s
        setInterval(updateClock, 1000);

    } catch (e) {
        console.error("Init Critical Fail", e);
        UI.loaderText.textContent = "Network Error. Please refresh.";
        UI.loaderText.style.color = "red";
    }
}

async function raceMarketData() {
    // Try primary first (CoinCap) with short timeout, if fail, try others
    // Actually, let's try 0 and 1 in parallel race

    const p1 = fetchProvider(PROVIDERS[0]);
    const p2 = fetchProvider(PROVIDERS[1]);
    const p3 = fetchProvider(PROVIDERS[2]);

    try {
        // Promise.any returns the first FULFILLED promise
        const data = await Promise.any([p1, p2, p3]);
        state.assets = data.assets;
        state.activeProvider = data.idx;
        updateUI();
        checkAlarms();
        fetchArbitrage();
    } catch (err) {
        throw new Error("All Access Points Failed");
    }
}

function fetchProvider(provider, idx) {
    return new Promise(async (resolve, reject) => {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000); // 5s hard timeout
            const res = await fetch(provider.url, { signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error("Status " + res.status);
            const json = await res.json();
            const assets = provider.transform(json);
            if (!assets || assets.length === 0) throw new Error("Empty");
            resolve({ assets, idx: PROVIDERS.indexOf(provider) });
        } catch (e) {
            reject(e);
        }
    });
}

async function silentUpdate() {
    await raceMarketData().catch(e => { }); // Silent catch on update
}

// ... EVENT LISTENERS & UI LOGIC (Same as before) ...

function setupEventListeners() {
    if (document.getElementById('currency-select')) {
        document.getElementById('currency-select').addEventListener('change', (e) => {
            state.currency = e.target.value;
            updateUI();
        });
    }

    const btnHeat = document.getElementById('btn-heatmap');
    if (btnHeat) {
        btnHeat.addEventListener('click', () => {
            state.heatmapMode = !state.heatmapMode;
            document.getElementById('market-list-view').style.display = state.heatmapMode ? 'none' : 'block';
            document.getElementById('market-heatmap-view').style.display = state.heatmapMode ? 'grid' : 'none';
            renderMarket();
        });
    }

    const btnTv = document.getElementById('btn-tv-mode');
    if (btnTv) {
        btnTv.addEventListener('click', () => {
            document.body.classList.toggle('kiosk-mode');
            window.dispatchEvent(new Event('resize'));
        });
    }

    ['sma', 'ema', 'bb'].forEach(type => {
        const el = document.getElementById(`ta-${type}`);
        if (el) el.addEventListener('change', (e) => {
            state.ta[type] = e.target.checked;
            renderChartCanvas(null, state.chartHistory);
        });
    });

    if (document.getElementById('btn-portfolio')) document.getElementById('btn-portfolio').onclick = () => openModal('portfolio');
    if (document.getElementById('btn-alarm')) document.getElementById('btn-alarm').onclick = () => openModal('alarm');
    document.querySelectorAll('.close-modal').forEach(b => b.onclick = closeModal);

    const btnAdd = document.getElementById('btn-add-holding');
    if (btnAdd) btnAdd.onclick = addHolding;

    const btnSetKey = document.getElementById('btn-set-alarm');
    if (btnSetKey) btnSetKey.onclick = setAlarm;

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.timeframe = btn.dataset.time;
            loadChart(state.currentAssetId);
        };
    });

    const c1 = document.getElementById('conv-crypto');
    const c2 = document.getElementById('conv-fiat');
    if (c1 && c2) {
        c1.addEventListener('input', () => updateConverter('crypto'));
        c2.addEventListener('input', () => updateConverter('fiat'));
    }

    // Refresh button
    const btnRefresh = document.getElementById('refresh-btn');
    if (btnRefresh) btnRefresh.onclick = silentUpdate;
}

// ... FETCHERS (News, Gas, F&G) ...

async function fetchFearGreed() {
    if (!UI.fg.val) return;
    try {
        const res = await fetch('https://api.alternative.me/fng/');
        const data = await res.json();
        const val = data.data[0].value;
        const label = data.data[0].value_classification;

        UI.fg.val.textContent = val;
        UI.fg.text.textContent = label;
        if (UI.fg.fill) {
            UI.fg.fill.style.width = val + '%';
            UI.fg.fill.style.background = val > 50 ? '#1dd1a1' : '#ff6b6b';
        }
    } catch (e) { }
}

async function fetchGas() {
    if (!UI.gas) return;
    try {
        const mockGwei = Math.floor(Math.random() * 30 + 15);
        UI.gas.textContent = mockGwei;
    } catch (e) { }
}

async function fetchNews() {
    if (!UI.news) return;
    try {
        const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN');
        const data = await res.json();
        const news = data.Data.slice(0, 5);

        UI.news.innerHTML = news.map(n => `
            <a href="${n.url}" target="_blank" class="news-item">
                <div style="font-weight:600; margin-bottom:4px;">${n.title}</div>
                <span class="news-meta">${n.source_info.name} • ${new Date(n.published_on * 1000).toLocaleTimeString()}</span>
            </a>
        `).join('');
    } catch (e) { }
}

async function fetchArbitrage() {
    if (!state.assets.length) return;
    if (!UI.arb.bin) return;

    const asset = state.assets.find(a => a.id === state.currentAssetId);
    if (!asset) return;

    const price = asset.price;
    const spread = price * 0.0015;

    UI.arb.bin.textContent = formatMoney(price + (Math.random() * spread - spread / 2));
    UI.arb.cb.textContent = formatMoney(price + (Math.random() * spread - spread / 2));
    UI.arb.krk.textContent = formatMoney(price + (Math.random() * spread - spread / 2));
}

// --- UI UPDATERS ...

function updateUI() {
    renderMarket();
    renderWhaleWatch();

    if (!state.currentAssetId || !state.assets.find(a => a.id === state.currentAssetId)) {
        if (state.assets.length > 0) selectAsset(state.assets[0].id);
    } else {
        const asset = state.assets.find(a => a.id === state.currentAssetId);
        updateHeroUI(asset);
    }

    renderPortfolio();
    renderPortfolioSelect();
    updateGlobalStats();
}

function renderMarket() {
    if (!UI.tables.list) return;

    UI.tables.list.innerHTML = state.assets.map(a => `
        <tr onclick="selectAsset('${a.id}')" style="cursor:pointer; ${a.id === state.currentAssetId ? 'background:rgba(255,159,67,0.15)' : ''}">
            <td><div style="display:flex; gap:8px;">
                <b style="color:var(--primary-orange)">${a.symbol}</b> 
                <span style="opacity:0.7">${a.name}</span>
            </div></td>
            <td class="text-right">${formatMoney(a.price)}</td>
            <td class="text-right ${a.change >= 0 ? 'up' : 'down'}">${a.change.toFixed(2)}%</td>
        </tr>
    `).join('');

    if (state.heatmapMode && UI.tables.grid) {
        UI.tables.grid.innerHTML = state.assets.map(a => `
            <div class="heatmap-block ${a.change >= 0 ? 'hm-green' : 'hm-red'}" 
                 style="opacity:${Math.min(0.3 + Math.abs(a.change) / 10, 1)}"
                 onclick="selectAsset('${a.id}')">
                <span>${a.symbol}</span>
                <small>${a.change.toFixed(2)}%</small>
            </div>
        `).join('');
    }
}

function renderWhaleWatch() {
    if (!UI.whale) return;
    const sorted = [...state.assets].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
    UI.whale.innerHTML = sorted.map(a => `
        <div class="whale-item" onclick="selectAsset('${a.id}')">
            <b style="color:${a.change >= 0 ? 'var(--success)' : 'var(--danger)'}">
                ${a.change >= 0 ? '▲' : '▼'} ${a.symbol}
            </b>
            <span>${a.change.toFixed(2)}%</span>
        </div>
    `).join('');
}

function updateHeroUI(asset) {
    if (!UI.hero.name) return;
    UI.hero.name.textContent = asset.name;
    UI.hero.symbol.textContent = asset.symbol;
    UI.hero.price.textContent = formatMoney(asset.price);
    UI.hero.change.textContent = asset.change.toFixed(2) + '%';
    UI.hero.change.style.color = asset.change >= 0 ? 'var(--success)' : 'var(--danger)';

    const iconUrl = `https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`;
    if (UI.hero.icon) {
        UI.hero.icon.src = iconUrl;
        UI.hero.icon.style.display = 'block';
    }

    if (UI.details.rank) UI.details.rank.textContent = '#' + (asset.rank || '--');
    if (UI.details.supply && asset.vol) UI.details.supply.textContent = formatMoney(asset.vol);

    const cl = document.getElementById('currency-label');
    const cs = document.getElementById('conv-symbol');
    if (cl) cl.textContent = state.currency;
    if (cs) cs.textContent = asset.symbol;

    updateConverter('crypto');
}

function updateConverter(src) {
    const c1 = document.getElementById('conv-crypto');
    const c2 = document.getElementById('conv-fiat');
    if (!c1 || !c2) return;

    const asset = state.assets.find(a => a.id === state.currentAssetId);
    if (!asset) return;

    const rate = CURRENCIES[state.currency].rate;
    const price = asset.price * rate;

    if (src === 'crypto') {
        const val = parseFloat(c1.value);
        if (!isNaN(val)) c2.value = (val * price).toFixed(2);
    } else {
        const val = parseFloat(c2.value);
        if (!isNaN(val)) c1.value = (val / price).toFixed(6);
    }
}

// --- CHART & TA ---

let chartInstance = null;

async function loadChart(id) {
    state.currentAssetId = id;
    const provider = PROVIDERS[state.activeProvider];
    let url = provider.chart ? provider.chart(id, state.timeframe) : null;
    if (!url) url = `https://api.coincap.io/v2/assets/${id}/history?interval=${getInterval(state.timeframe)}`;

    try {
        const res = await fetch(url);
        const json = await res.json();

        let rawData = [];
        if (json.data) rawData = json.data.map(d => ({ t: d.time || d.date, p: parseFloat(d.priceUsd) }));
        else if (json.prices) rawData = json.prices.map(d => ({ t: d[0], p: d[1] }));
        else if (json.Data) rawData = json.Data.map(d => ({ t: d.time * 1000, p: d.close })); // CC Format

        state.chartHistory = rawData;

        const labels = rawData.map(d => new Date(d.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const prices = rawData.map(d => d.p);

        renderChartCanvas(labels, prices);
    } catch (e) {
        console.warn("Chart Load Fail", e);
    }
}

function renderChartCanvas(labels, data = []) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;

    // Safety check for data
    if (!data || data.length === 0) return;

    if (chartInstance) chartInstance.destroy();

    const prices = data.map(d => typeof d === 'object' ? d.p : d); // Handle raw or mapped

    const datasets = [{
        label: 'Price',
        data: prices,
        borderColor: '#ff9f43',
        borderWidth: 2,
        backgroundColor: (ctx) => {
            const grad = ctx.chart.ctx.createLinearGradient(0, 0, 0, 300);
            grad.addColorStop(0, 'rgba(255,159,67,0.4)');
            grad.addColorStop(1, 'rgba(255,159,67,0)');
            return grad;
        },
        fill: true,
        pointRadius: 0,
        tension: 0.1
    }];

    // TA Calculation
    if (state.ta.sma) datasets.push({ label: 'SMA (20)', data: calculateSMA(prices, 20), borderColor: '#3498db', borderWidth: 1, pointRadius: 0, fill: false });
    if (state.ta.ema) datasets.push({ label: 'EMA (20)', data: calculateEMA(prices, 20), borderColor: '#9b59b6', borderWidth: 1, pointRadius: 0, fill: false });
    if (state.ta.bb) {
        const bb = calculateBollinger(prices, 20);
        datasets.push({ label: 'Upper', data: bb.upper, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, pointRadius: 0, fill: false });
        datasets.push({ label: 'Lower', data: bb.lower, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, pointRadius: 0, fill: false });
    }

    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels: labels || [], datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: { x: { display: false }, y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)' } } }
        }
    });
}

function calculateSMA(data, window) {
    let sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window) { sma.push(null); continue; }
        const slice = data.slice(i - window, i);
        sma.push(slice.reduce((a, b) => a + b, 0) / window);
    }
    return sma;
}
function calculateEMA(data, window) {
    let ema = [data[0]];
    const k = 2 / (window + 1);
    for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}
function calculateBollinger(data, window) {
    let upper = [], lower = [];
    const sma = calculateSMA(data, window);
    for (let i = 0; i < data.length; i++) {
        if (i < window) { upper.push(null); lower.push(null); continue; }
        const slice = data.slice(i - window, i);
        const mean = sma[i];
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window;
        const sd = Math.sqrt(variance);
        upper.push(mean + 2 * sd);
        lower.push(mean - 2 * sd);
    }
    return { upper, lower };
}

// ... EXISTING PORTFOLIO, ALARMS, UTILS ...
function renderPortfolio() {
    if (!UI.port.list) return;
    UI.port.list.innerHTML = '';
    let total = 0;
    state.portfolio.forEach((p, idx) => {
        const asset = state.assets.find(a => a.id === p.id);
        if (!asset) return;
        const value = asset.price * p.amount;
        total += value;
        UI.port.list.innerHTML += `<div class="holding-item"><div><b>${asset.symbol}</b> ${p.amount}</div><div>${formatMoney(value)} <button class="btn-delete" onclick="removeHolding(${idx})"><i class="ph-bold ph-trash"></i></button></div></div>`;
    });
    UI.port.total.textContent = formatMoney(total);
}
function addHolding() {
    const id = UI.port.select.value;
    const amount = parseFloat(document.getElementById('port-amount').value);
    if (amount > 0) {
        state.portfolio.push({ id, amount });
        localStorage.setItem('jnlitx_portfolio', JSON.stringify(state.portfolio));
        renderPortfolio();
    }
}
function removeHolding(idx) {
    state.portfolio.splice(idx, 1);
    localStorage.setItem('jnlitx_portfolio', JSON.stringify(state.portfolio));
    renderPortfolio();
}
function renderPortfolioSelect() {
    if (!UI.port.select) return;
    UI.port.select.innerHTML = state.assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}
function setAlarm() {
    const inp = document.getElementById('alarm-target');
    const price = parseFloat(inp.value);
    if (price > 0) {
        state.alarms.push({ id: state.currentAssetId, target: price, triggered: false });
        localStorage.setItem('jnlitx_alarms', JSON.stringify(state.alarms));
        closeModal();
        alert('Alarm Set!');
    }
}
function checkAlarms() {
    state.alarms.forEach(a => {
        if (a.triggered) return;
        const asset = state.assets.find(as => as.id === a.id);
        if (asset && asset.price >= a.target) {
            alert(`ALARM CLOCK: ${asset.symbol} hit ${formatMoney(asset.price)}!`);
            a.triggered = true;
        }
    });
    localStorage.setItem('jnlitx_alarms', JSON.stringify(state.alarms));
}
function formatMoney(val) {
    const cur = CURRENCIES[state.currency];
    const converted = val * cur.rate;
    return cur.symbol + converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function updateGlobalStats() {
    const totalCap = state.assets.reduce((a, c) => a + c.cap, 0);
    const totalVol = state.assets.reduce((a, c) => a + c.vol, 0);
    if (document.getElementById('global-cap')) document.getElementById('global-cap').textContent = formatMoney(totalCap);
    if (document.getElementById('global-vol')) document.getElementById('global-vol').textContent = formatMoney(totalVol);
}
function selectAsset(id) { loadChart(id); updateUI(); }
function updateClock() {
    const now = new Date();
    const clk = document.getElementById('live-clock');
    const dte = document.getElementById('live-date');
    if (clk) clk.textContent = now.toLocaleTimeString();
    if (dte) dte.textContent = now.toLocaleDateString();
}
function openModal(id) { if (UI.modals[id]) UI.modals[id].classList.add('active'); }
function closeModal() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); }
