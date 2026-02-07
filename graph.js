/**
 * MONASPECT GRAPH ENGINE
 * Zero-dependency SVG Charting System
 */
const Graph = {
    state: {
        isDragging: false,
        lastX: 0,
        data: []
    },

    render(containerId, data, color = '#00f2ea') {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.state.data = data;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const padding = 20;

        // 1. Calculate Min/Max
        const prices = data.map(d => d[1]); // [time, price]
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min;

        // 2. Generate Path
        const stepX = width / (data.length - 1);

        let pathD = `M 0 ${height - ((prices[0] - min) / range) * (height - padding * 2) - padding}`;

        // Area Path (for gradient)
        let areaD = pathD;

        data.forEach((point, i) => {
            const x = i * stepX;
            const y = height - ((point[1] - min) / range) * (height - padding * 2) - padding;

            // Cubic Bezier Smoothing
            // Simplification: LineTo for performance on many points, Bezier for small datasets
            // Using LineTo for robustness on large datasets first
            pathD += ` L ${x} ${y}`;
            areaD += ` L ${x} ${y}`;
        });

        areaD += ` L ${width} ${height} L 0 ${height} Z`;

        // 3. Inject SVG
        container.innerHTML = `
            <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                
                <path d="${areaD}" fill="url(#chartGradient)" stroke="none" />
                <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" />
                
                <!-- Crosshair Elements -->
                <line id="crosshairX" class="crosshair-line" x1="0" y1="0" x2="0" y2="100%" />
                <circle id="crosshairDot" r="4" fill="#fff" cx="0" cy="0" style="opacity: 0" />
            </svg>
            <div id="tooltip" class="chart-tooltip"></div>
        `;

        // 4. Attach Listeners
        this.attachInteractions(container, width, height, min, range, padding, stepX);
    },

    attachInteractions(container, width, height, min, range, padding, stepX) {
        const svg = container.querySelector('svg');
        const tooltip = container.querySelector('#tooltip');
        const crosshair = container.querySelector('#crosshairX');
        const dot = container.querySelector('#crosshairDot');

        const moveHandler = (e) => {
            const rect = container.getBoundingClientRect();
            let clientX = e.clientX || e.touches[0].clientX;
            let relX = clientX - rect.left;

            // Clamp
            if (relX < 0) relX = 0;
            if (relX > width) relX = width;

            // Find nearest data point
            const index = Math.round(relX / stepX);
            const point = this.state.data[index];

            if (!point) return;

            const x = index * stepX;
            const y = height - ((point[1] - min) / range) * (height - padding * 2) - padding;

            // Update UI
            crosshair.setAttribute('x1', x);
            crosshair.setAttribute('x2', x);
            crosshair.style.opacity = 1;

            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.style.opacity = 1;

            // Tooltip
            tooltip.style.opacity = 1;
            tooltip.style.left = `${x + 10}px`;
            tooltip.style.top = `${y - 40}px`;

            const date = new Date(point[0]);
            const price = point[1].toLocaleString(undefined, { style: 'currency', currency: 'USD' });
            tooltip.innerHTML = `
                <div>${price}</div>
                <div style="color: #aaa; font-size: 0.7em">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
            `;
        };

        const leaveHandler = () => {
            crosshair.style.opacity = 0;
            dot.style.opacity = 0;
            tooltip.style.opacity = 0;
        };

        container.addEventListener('mousemove', moveHandler);
        container.addEventListener('mouseleave', leaveHandler);
        container.addEventListener('touchmove', moveHandler, { passive: true });
        container.addEventListener('touchend', leaveHandler);
    }
};
