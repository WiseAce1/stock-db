const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const FMP_KEY = process.env.FMP_KEY;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

app.use(express.static('public'));

let cache = {
  data: null,
  lastFetched: null
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchQuote(ticker) {
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${AV_KEY}`
    );
    const data = await res.json();
    const q = data['Global Quote'];
    if (!q || !q['05. price']) return null;
    const price = parseFloat(q['05. price']);
    const change = parseFloat(q['09. change']);
    const changePct = parseFloat(q['10. change percent']);
    return {
      ticker,
      price: price.toFixed(2),
      change: change.toFixed(2),
      changePct: changePct.toFixed(2),
      isUp: change >= 0,
      sparkline: []
    };
  } catch (e) {
    console.error(`Error fetching ${ticker}:`, e.message);
    return null;
  }
}

async function fetchMovers() {
  try {
    const [gainRes, loseRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${FMP_KEY}`)
    ]);
    const gainers = (await gainRes.json()).filter(s => s.price >= 5).slice(0, 2).map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: parseFloat(s.price).toFixed(2),
      changePct: Math.abs(s.changesPercentage).toFixed(2),
      isUp: true
    }));
    const losers = (await loseRes.json()).filter(s => s.price >= 5).slice(0, 2).map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: parseFloat(s.price).toFixed(2),
      changePct: Math.abs(s.changesPercentage).toFixed(2),
      isUp: false
    }));
    return [...gainers, ...losers];
  } catch (e) {
    console.error('Error fetching movers:', e.message);
    return [];
  }
}

async function fetchNews() {
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&limit=5&apikey=${AV_KEY}`
    );
    const data = await res.json();
    return (data.feed || []).slice(0, 5).map(n => ({
      title: n.title,
      source: n.source,
      url: n.url
    }));
  } catch (e) {
    console.error('Error fetching news:', e.message);
    return [];
  }
}

async function fetchAllMarketData() {
  const INDICES = ['SPY', 'QQQ', 'DIA', 'IWM'];
  const indices = [];

  for (const ticker of INDICES) {
    const result = await fetchQuote(ticker);
    indices.push(result);
    await sleep(500);
  }

  const [movers, news] = await Promise.all([
    fetchMovers(),
    fetchNews()
  ]);

  return { indices, movers, news };
}

app.get('/api/market', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && cache.lastFetched && (now - cache.lastFetched) < CACHE_DURATION) {
      console.log('Serving cached data');
      return res.json({ ...cache.data, cached: true });
    }

    console.log('Fetching fresh market data...');
    const data = await fetchAllMarketData();
    cache.data = data;
    cache.lastFetched = now;

    res.json({ ...data, cached: false });

  } catch (err) {
    console.error('Market API error:', err.message);
    if (cache.data) {
      return res.json({ ...cache.data, cached: true });
    }
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
