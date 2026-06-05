const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const YF_BASE = 'https://query1.finance.yahoo.com';

app.use(express.static('public'));

app.get('/api/market', async (req, res) => {
  try {
    const INDICES = ['SPY', 'QQQ', 'DIA', 'IWM'];

    async function fetchQuoteAndSparkline(ticker) {
      try {
        const response = await fetch(
          `${YF_BASE}/v8/finance/chart/${ticker}?interval=30m&range=1d`
        );
        const data = await response.json();
        const result = data?.chart?.result?.[0];
        if (!result?.meta) return null;
        const meta = result.meta;
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? 0;
        const change = price - prevClose;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;
        const closes = result.indicators?.quote?.[0]?.close ?? [];
        const sparkline = closes.filter(v => v !== null && v !== undefined);
        return {
          ticker,
          price: price.toFixed(2),
          change: change.toFixed(2),
          changePct: changePct.toFixed(2),
          isUp: change >= 0,
          sparkline
        };
      } catch { return null; }
    }

    async function fetchMovers() {
      try {
        const [gainRes, loseRes] = await Promise.all([
          fetch(`${YF_BASE}/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=3`),
          fetch(`${YF_BASE}/v1/finance/screener/predefined/saved?scrIds=day_losers&count=3`)
        ]);
        const gainData = await gainRes.json();
        const loseData = await loseRes.json();
        const gainers = (gainData?.finance?.result?.[0]?.quotes ?? []).slice(0, 2).map(q => ({
          symbol: q.symbol,
          name: q.shortName,
          price: q.regularMarketPrice.toFixed(2),
          changePct: q.regularMarketChangePercent.toFixed(2),
          isUp: true
        }));
        const losers = (loseData?.finance?.result?.[0]?.quotes ?? []).slice(0, 2).map(q => ({
          symbol: q.symbol,
          name: q.shortName,
          price: q.regularMarketPrice.toFixed(2),
          changePct: Math.abs(q.regularMarketChangePercent).toFixed(2),
          isUp: false
        }));
        return [...gainers, ...losers];
      } catch { return []; }
    }

    async function fetchNews() {
      try {
        const response = await fetch(
          `${YF_BASE}/v1/finance/search?q=stock+market&newsCount=5&quotesCount=0`
        );
        const data = await response.json();
        return (data?.news ?? []).slice(0, 5).map(n => ({
          title: n.title,
          source: n.publisher,
          url: n.link
        }));
      } catch { return []; }
    }

    async function fetchIndicesSequentially() {
  const results = [];
  for (const ticker of INDICES) {
    const result = await fetchQuoteAndSparkline(ticker);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return results;
}

const [indices, movers, news] = await Promise.all([
  fetchIndicesSequentially(),
  fetchMovers(),
  fetchNews()
]);

    res.json({ indices, movers, news });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
