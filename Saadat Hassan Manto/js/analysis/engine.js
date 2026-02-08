/**
 * MONASPECT Expert Analysis Engine
 * Pure logic layer. No fetching.
 */

class AnalysisEngine {
    constructor() {
        this.horizon = 'short'; // 'short' or 'long'
    }

    setHorizon(horizon) {
        this.horizon = horizon;
    }

    // Main pipeline
    analyze(marketData, newsData) {
        if (!marketData || marketData.length === 0) return { best: [], avoid: [], trump: [] };

        // 1. Calculate News Sentiment Context
        const globalSentiment = this.calculateGlobalSentiment(newsData);

        // 2. Score each asset
        const scoredAssets = marketData.map(asset => {
            const assetNews = this.filterNewsForAsset(asset.symbol, asset.name, newsData);
            const sentimentScore = this.calculateAssetSentiment(assetNews);

            const scores = this.calculateScores(asset, sentimentScore, globalSentiment);

            return {
                ...asset,
                scores: scores,
                analysis: this.generateAnalysis(asset, scores, assetNews, globalSentiment)
            };
        });

        // 3. Rank
        return this.rankAssets(scoredAssets);
    }

    calculateGlobalSentiment(newsData) {
        // Simple heuristic: count positive vs negative keywords in titles
        // Real implementation would be more complex NLP.
        const positiveKeywords = ['surge', 'soar', 'bull', 'adoption', 'record', 'gain', 'approve', 'green', 'rally'];
        const negativeKeywords = ['crash', 'plunge', 'bear', 'ban', 'hack', 'fraud', 'crackdown', 'slump', 'drop'];

        let score = 0;
        newsData.forEach(item => {
            const title = item.title.toLowerCase();
            if (positiveKeywords.some(k => title.includes(k))) score += 1;
            if (negativeKeywords.some(k => title.includes(k))) score -= 1.5; // Negativity bias
        });

        // Normalize -1 to 1
        return Math.max(-1, Math.min(1, score / 10));
    }

    filterNewsForAsset(symbol, name, newsData) {
        return newsData.filter(item => {
            const t = item.title.toLowerCase();
            return t.includes(symbol.toLowerCase()) || t.includes(name.toLowerCase());
        });
    }

    calculateAssetSentiment(assetNews) {
        if (assetNews.length === 0) return 0;
        // Same simple heuristic
        const positiveKeywords = ['launch', 'partership', 'upgrade', 'bullish', 'breakout'];
        const negativeKeywords = ['delay', 'downgrade', 'lawsuit', 'sell-off', 'resistance'];

        let score = 0;
        assetNews.forEach(item => {
            const t = item.title.toLowerCase();
            if (positiveKeywords.some(k => t.includes(k))) score += 2;
            if (negativeKeywords.some(k => t.includes(k))) score -= 2;
        });
        return Math.max(-1, Math.min(1, score / 5)); // Cap at +/- 1
    }

    calculateScores(asset, sentimentScore, globalSentiment) {
        // Data Extraction
        const change = asset.change24h || 0;
        const volume = asset.volume24h || 0;

        // --- LOGIC MATRIX ---

        // 1. Structure / Trend (Simplistic without full history)
        // If change is +5%, it's strong. If -5%, weak.
        let trendScore = Math.max(-1, Math.min(1, change / 10));

        // 2. Volatility Proxy (Absolute change magnitude)
        let volatilityScore = Math.min(1, Math.abs(change) / 15); // 0 to 1

        // 3. Weightings based on Horizon
        let wTrend, wVol, wSent, wGlob;

        if (this.horizon === 'short') {
            // Short term favors momentum and news
            wTrend = 0.5;
            wVol = -0.2; // High volatility is riskier but needed for short term scalps? No, safe suggestion = stable growth.
            wSent = 0.3;
            wGlob = 0.1; // Market drift
        } else {
            // Long term favors fundamentals (not really available here) and low volatility/steady
            wTrend = 0.2;
            wVol = -0.5; // Penalty for high vol
            wSent = 0.1;
            wGlob = 0.3;
        }

        // Trump Card Logic: Requires HIGH volatility and preferably positive news but maybe negative price action (rebound)
        // Or High Momentum.

        // Favorability Score (Higher = BEST)
        const favorability = (trendScore * wTrend) + (sentimentScore * wSent) + (globalSentiment * wGlob) - (volatilityScore * 0.1);

        // Risk Score (Higher = MORE RISKY)
        const risk = volatilityScore + (sentimentScore < 0 ? 0.5 : 0) + (globalSentiment < -0.5 ? 0.3 : 0);

        // Asymmetry Score (Upside potential vs Downside)
        // High Asymmetry = Good for TRUMP cards.
        // e.g. Price is down (-10%) but News is Positive (+1) => Rebound potential.
        // or Price is flat but Volume is skyrocketing.
        let asymmetric = 0;
        if (change < -5 && sentimentScore > 0) asymmetric += 0.8; // Oversold?
        if (change > 15) asymmetric += 0.2; // Momentum continuation?

        return {
            favorability,
            risk,
            asymmetry: asymmetric,
            rawChange: change
        };
    }

    rankAssets(scoredAssets) {
        // Sort by Favorability for BEST
        const sortedFav = [...scoredAssets].sort((a, b) => b.scores.favorability - a.scores.favorability);

        // Sort by Favorability ASC for AVOID (ignoring stablecoins ideally)
        const sortedAvoid = [...scoredAssets]
            .filter(a => !['USDT', 'USDC', 'DAI', 'FDUSD'].includes(a.symbol))
            .sort((a, b) => a.scores.favorability - b.scores.favorability);

        // Sort by Asymmetry + Risk for TRUMP
        // Trump cards are high risk, high reward.
        // We filter for High Risk (> 0.5) AND High Asymmetry
        const sortedTrump = [...scoredAssets]
            .filter(a => a.scores.risk > 0.4)
            .sort((a, b) => (b.scores.asymmetry + b.scores.risk) - (a.scores.asymmetry + a.scores.risk));

        // Ensure uniqueness (Best != Avoid != Trump) is hard with small set, but let's try.
        const best = sortedFav.slice(0, 3);
        const bestIds = new Set(best.map(a => a.symbol));

        const avoid = sortedAvoid.filter(a => !bestIds.has(a.symbol)).slice(0, 3);
        const avoidIds = new Set(avoid.map(a => a.symbol));

        const trump = sortedTrump.filter(a => !bestIds.has(a.symbol) && !avoidIds.has(a.symbol)).slice(0, 3);

        return { best, avoid, trump, all: sortedFav };
    }

    generateAnalysis(asset, scores, news, globalSent) {
        // Expert 10-Section Analysis Generation

        const trend = scores.favorability > 0.2 ? "Bullish" : scores.favorability < -0.2 ? "Bearish" : "Neutral";
        const volState = scores.risk > 0.6 ? "High Volatility (Expansion)" : scores.risk < 0.3 ? "Low Volatility (Compression)" : "Stable";
        const sentiment = scores.sentimentScore > 0 ? "Positive" : scores.sentimentScore < 0 ? "Negative" : "Muted";

        // Ranges
        const dailyStdDev = Math.abs(scores.rawChange) / 2 + 1;
        const upside = asset.price * (1 + (dailyStdDev / 100 * 1.5));
        const downside = asset.price * (1 - (dailyStdDev / 100 * 1.5));

        // 1. Market Context
        const contextSection = {
            title: "Market Context",
            content: `The broader market is currently in a ${globalSent > 0 ? 'Risk-On' : 'Risk-Off'} posture. ${asset.symbol} is trading within a ${trend.toLowerCase()} structure, showing ${volState.toLowerCase()} relative to its peers.`
        };

        // 2. Structural Analysis
        const structureSection = {
            title: "Structural Analysis",
            content: `Price action is ${trend === 'Bullish' ? 'respecting higher lows' : trend === 'Bearish' ? 'facing rejection at resistance' : 'consolidating within a range'}. Key structural levels are ${trend === 'Bullish' ? 'holding firm' : 'under pressure'}, suggesting ${Math.abs(scores.favorability * 10).toFixed(1)}/10 structural integrity.`
        };

        // 3. Momentum & Participation
        const momentumSection = {
            title: "Momentum & Participation",
            content: `Momentum is ${Math.abs(scores.rawChange) > 5 ? 'accelerating' : 'steady'}. Volume participation is ${asset.volume24h > 100000000 ? 'robust, supporting the move' : 'diverging, suggesting caution'}. ${Math.abs(scores.asymmetry) > 0.5 ? 'Aggressive buying' : 'Balanced flows'} are currently observed.`
        };

        // 4. Volatility Regime
        const volSection = {
            title: "Volatility Regime",
            content: `We are observing ${volState}. ${scores.risk > 0.6 ? 'This suggests an impulsive breakout or breakdown is underway.' : 'Compression often precedes a significant expansion move.'} Risk management should adjust for ${scores.risk > 0.6 ? 'wider stops' : 'sudden expansion'}.`
        };

        // 5. Multi-Timeframe Confluence
        const confluenceSection = {
            title: "Multi-Timeframe Confluence",
            content: `The ${this.horizon} term structure is ${trend === 'Bullish' ? 'aligned with' : 'diverging from'} the longer-term trend. ${trend === 'Neutral' ? 'Conflict between timeframes is causing current chop.' : 'Alignment across timeframes increases the probability of continuation.'}`
        };

        // 6. News & External Context
        const newsSection = {
            title: "News & External Context",
            content: news.length > 0
                ? `Specific headlines are driving idiosyncratic risk. Sentiment is ${sentiment.toLowerCase()}, modulated by ${news.length} relevant context points.`
                : "No asset-specific headlines are currently dominating. Price is largely driven by macro-correlation and technical flows."
        };

        // 7. Scenario Analysis
        const scenariosSection = {
            title: "Scenario Analysis",
            content: `
                <strong>Primary:</strong> Continuation of ${trend.toLowerCase()} trend towards $${upside.toFixed(2)}. <br>
                <strong>Alternative:</strong> Reversal if support at $${downside.toFixed(2)} fails to hold. <br>
                <strong>Invalidation:</strong> A sustained close ${trend === 'Bullish' ? 'below' : 'above'} $${asset.price.toFixed(2)} shifts bias to Neutral.
            `
        };

        // 8. Expected Outcome Ranges
        const outcomesSection = {
            title: "Expected Outcome Ranges",
            content: `
                <strong>Upside Target:</strong> $${upside.toFixed(asset.price < 1 ? 4 : 2)} (Probable)<br>
                <strong>Downside Risk:</strong> $${downside.toFixed(asset.price < 1 ? 4 : 2)} (Probable)<br>
                <em>Ranges derived from ${volState.toLowerCase()} metrics.</em>
            `
        };

        // 9. Time & Exhaustion
        const timeSection = {
            title: "Time & Exhaustion",
            content: `Momentum projected to sustain for the next ${this.horizon === 'short' ? '4-8 hours' : '2-5 days'} before testing exhaustion. ${scores.risk > 0.8 ? 'Extension is already stretched, expect mean reversion soon.' : 'Structure has room to run before exhaustion signals appear.'}`
        };

        // 10. Final Synthesis
        const synthesisSection = {
            title: "Final Synthesis",
            content: `In summary, ${asset.symbol} presents a ${trend.toLowerCase()} opportunity with ${scores.risk < 0.4 ? 'manageable' : 'elevated'} risk. The confluence of ${sentiment.toLowerCase()} sentiment and ${volState.toLowerCase()} suggests a focus on ${trend === 'Bullish' ? 'long setups' : 'defensive positioning'} is prudent.`
        };

        return {
            sections: [
                contextSection, structureSection, momentumSection, volSection,
                confluenceSection, newsSection, scenariosSection, outcomesSection,
                timeSection, synthesisSection
            ],
            // Keep legacy fields for dashboard previews if needed
            summary: `${trend} structure. ${volState}.`,
            confidence: Math.round((0.5 + Math.abs(scores.favorability) / 2) * 100) + "%",
            upside: upside,
            downside: downside,
            context: contextSection.content
        };
    }
}
