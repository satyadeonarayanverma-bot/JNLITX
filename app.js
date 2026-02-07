/**
 * MONASPECT - Premium Crypto Analytics
 * @author Aditya Verma
 */

// --- STATE MANAGEMENT ---
const State = {
    currentView: 'home',
    cryptoData: [],
    selectedCoin: null,
    cache: new Map(),
    apiStatus: {
        coingecko: true,
        coincap: true,
        cryptocompare: true
    }
};

// --- ROUTER ---
const Router = {
    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute(); // Handle initial load
    },

    handleRoute() {
        const hash = window.location.hash.slice(1);
        const [route, param] = hash.split('=');

        if (!route || route === 'home') {
            App.renderHome();
        } else if (route === 'coin' && param) {
            App.renderCoinDetail(param);
        } else {
            window.location.hash = ''; // Fallback to home
        }
    },

    navigateTo(route, param = null) {
        if (param) {
            window.location.hash = `${route}=${param}`;
        } else {
            window.location.hash = route;
        }
    }
};

// --- APP CORE ---
const App = {
    init() {
        console.log('MONASPECT initialized');
        Router.init();
        this.simulateLoading();
    },

    simulateLoading() {
        // Temporary simulation to show loading state
        setTimeout(() => {
            const content = document.getElementById('content');
            if (window.location.hash === '' || window.location.hash === '#home') {
                this.renderHome();
            }
        }, 1500);
    },

    async renderHome() {
        State.currentView = 'home';
        const content = document.getElementById('content');

        content.innerHTML = `
            <div class="dashboard-header fade-in">
                <h2>Top Market Movers</h2>
                <div class="market-status">
                    <span class="status-dot online"></span> Live Data
                </div>
            </div>
            
            <div class="coin-grid" id="coinGrid">
                <div class="loading-state">Scanning generic blockchain protocols...</div>
            </div>
        `;

        try {
            const coins = await Hydra.fetchTop20();
            State.cryptoData = coins;
            this.renderCoinGrid(coins);
        } catch (error) {
            document.getElementById('coinGrid').innerHTML = `
                <div class="error-state">
                    <h3>Connection Lost</h3>
                    <p>${error.message}</p>
                    <button onclick="App.renderHome()">Retry Connection</button>
                </div>
            `;
        }
    },

    renderCoinGrid(coins) {
        const grid = document.getElementById('coinGrid');
        if (!grid) return;

        grid.innerHTML = coins.map((coin, index) => {
            const isPositive = coin.change24h >= 0;
            const changeClass = isPositive ? 'text-green' : 'text-red';
            const changeIcon = isPositive ? '↗' : '↘';

            // Simple Sparkline SVG generation
            const sparklineSVG = this.generateSparkline(coin.sparkline, isPositive);

            return `
                <div class="coin-card" 
                     style="animation-delay: ${index * 50}ms"
                     onclick="Router.navigateTo('coin', '${coin.id}')">
                    <div class="card-header">
                        <div class="coin-info">
                            <img src="${coin.image}" alt="${coin.name}" class="coin-icon" loading="lazy">
                            <div>
                                <div class="coin-name">${coin.name}</div>
                                <div class="coin-symbol">${coin.symbol}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card-price">$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
                    
                    <div class="card-meta">
                        <div class="percent-change ${changeClass}">
                            ${changeIcon} ${Math.abs(coin.change24h).toFixed(2)}%
                        </div>
                        ${sparklineSVG}
                    </div>
                </div>
            `;
        }).join('');
    },

    generateSparkline(data, isPositive) {
        if (!data || data.length === 0) return '';

        // Normalize data for SVG (80x30 box)
        const width = 80;
        const height = 30;
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min;

        const points = data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((val - min) / range) * height; // Invert Y
            return `${x},${y}`;
        }).join(' ');

        const color = isPositive ? 'var(--success)' : 'var(--danger)';

        return `
            <svg class="sparkline" viewBox="0 0 ${width} ${height}">
                <path d="M${points}" stroke="${color}" fill="none" />
            </svg>
        `;
    },

    async renderCoinDetail(coinId) {
        State.currentView = 'detail';
        let coin = State.cryptoData.find(c => c.id === coinId);

        // Fallback if deep linking or refresh
        if (!coin) {
            try {
                // Quick fetch single coin or reload logic
                const coins = await Hydra.fetchTop20(); // Simple fallback for now
                State.cryptoData = coins;
                coin = coins.find(c => c.id === coinId);
            } catch (e) { console.error(e); }
        }

        if (!coin) {
            document.getElementById('content').innerHTML = `<h2>Coin not found</h2>`;
            return;
        }

        State.selectedCoin = coin;

        const content = document.getElementById('content');
        const isPositive = coin.change24h >= 0;
        const colorClass = isPositive ? 'text-green' : 'text-red';

        content.innerHTML = `
            <div class="coin-detail-view">
                <button class="back-btn" onclick="Router.navigateTo('home')">← Back to Dashboard</button>
                
                <div class="detail-header">
                    <div class="coin-info">
                        <img src="${coin.image}" class="coin-icon" style="width: 48px; height: 48px;">
                        <div>
                            <h1 style="line-height: 1">${coin.name}</h1>
                            <span class="coin-symbol" style="font-size: 1rem">${coin.symbol}</span>
                        </div>
                    </div>
                    
                    <div class="detail-price-box">
                        <div class="big-price">$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        <div class="${colorClass}" style="font-weight: 600; font-size: 1.1rem;">
                            ${isPositive ? '▲' : '▼'} ${Math.abs(coin.change24h).toFixed(2)}% (24h)
                        </div>
                    </div>
                </div>

                <div class="timeframe-selector">
                    <button class="tf-btn active" onclick="App.switchTimeframe('1D', this)">1D</button>
                    <button class="tf-btn" onclick="App.switchTimeframe('1W', this)">1W</button>
                    <button class="tf-btn" onclick="App.switchTimeframe('1M', this)">1M</button>
                    <button class="tf-btn" onclick="App.switchTimeframe('1Y', this)">1Y</button>
                </div>

                <div class="chart-wrapper" id="mainChart">
                    <!-- Graph injected here -->
                    <div class="loader" style="position: absolute; top: 45%; left: 45%"></div>
                </div>

                <div class="glass-stats-grid">
                    ${this.renderStatCard('Market Cap', coin.marketCap)}
                    ${this.renderStatCard('Volume (24h)', coin.volume)}
                    ${this.renderStatCard('Circulating Supply', coin.circulating)}
                    ${this.renderStatCard('Max Supply', coin.maxSupply || '∞')}
                </div>
            </div>
        `;

        // Initial Load: 1D
        this.loadChartData(coinId, '1D');
    },

    renderStatCard(label, value) {
        const displayValue = typeof value === 'number'
            ? '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : value;

        return `
            <div class="coin-card" style="cursor: default; padding: 20px;">
                <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 8px;">${label}</div>
                <div style="font-size: 1.2rem; font-weight: 600;">${displayValue}</div>
            </div>
        `;
    },

    async switchTimeframe(tf, btn) {
        // UI Update
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Data Update
        const container = document.getElementById('mainChart');
        container.innerHTML = `<div class="loader" style="position: absolute; top: 45%; left: 45%"></div>`;

        await this.loadChartData(State.selectedCoin.id, tf);
    },

    async loadChartData(coinId, timeframe) {
        try {
            const history = await Hydra.fetchHistory(coinId, timeframe);
            if (history && history.length > 0) {
                // Clear loader
                document.getElementById('mainChart').innerHTML = '';
                // Render Graph
                const color = State.selectedCoin.change24h >= 0 ? '#00ff9d' : '#ff3b3b';
                Graph.render('mainChart', history, color);
            } else {
                document.getElementById('mainChart').innerHTML = '<div style="text-align:center; padding-top: 150px; color: var(--text-muted)">Chart Data Unavailable</div>';
            }
        } catch (e) {
            console.error(e);
            document.getElementById('mainChart').innerHTML = '<div style="text-align:center; padding-top: 150px; color: var(--danger)">Connection Error</div>';
        }
    }
};

// Initialize App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for debugging interaction in console
window.Monaspect = App;
