/* ============================================================
   script.js – Customer Feedback Sentiment Analyzer Dashboard
   Data source: customer_feedback.json (PRDECT-ID Dataset)
   ============================================================ */

'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Rows shown per page in the feedback table */
const ROWS_PER_PAGE = 15;

/** Stop-words untuk filter keyword (bahasa Indonesia + Inggris) */
const STOP_WORDS = new Set([
  'yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'tidak', 'ada', 'ke', 'dari',
  'untuk', 'pada', 'saya', 'sudah', 'sangat', 'juga', 'lebih', 'bisa', 'atau',
  'dalam', 'lagi', 'sudah', 'harga', 'bagus', 'barang', 'sekali', 'nya', 'aja',
  'tapi', 'kalau', 'waktu', 'belum', 'tapi', 'banget', 'puas', 'sih', 'tp',
  'yg', 'sy', 'dg', 'krn', 'sdh', 'sm', 'ud', 'udah', 'lg', 'ga', 'gak',
  'nggak', 'gk', 'si', 'kl', 'emg', 'kmrn', 'utk', 'dgn', 'bgt', 'dr',
  'the', 'and', 'is', 'in', 'to', 'of', 'a', 'an', 'for', 'this', 'that',
  'it', 'was', 'are', 'be', 'with', 'on', 'as', 'at', 'by', 'he', 'she',
  'they', 'we', 'my', 'your', 'but', 'not', 'so', 'have', 'had',
]);

/** Colour palettes */
const PALETTE = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral:  '#f59e0b',
  brand:    '#6366f1',
  series: [
    '#6366f1','#22c55e','#ef4444','#f59e0b','#3b82f6',
    '#ec4899','#14b8a6','#f97316','#8b5cf6','#06b6d4',
    '#84cc16','#a855f7','#0ea5e9','#e11d48','#10b981',
    '#fb923c','#7c3aed','#0284c7','#65a30d','#d946ef',
  ],
  emotions: {
    happy:   '#3b82f6',
    anger:   '#ef4444',
    fear:    '#8b5cf6',
    love:    '#ec4899',
    sadness: '#0ea5e9',
  },
};

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────

/** Raw dataset loaded from JSON */
let rawData = [];

/** Filtered dataset (after applying all active filters) */
let filteredData = [];

/** Currently active page in the table */
let currentPage = 1;

/** Current search string in the table search box */
let searchQuery = '';

/** Store Chart.js instances so we can destroy/update them on re-render */
const charts = {};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

// ─── DATA LOADING ─────────────────────────────────────────────────────────────

/**
 * Fetch the JSON file and bootstrap the dashboard.
 * Shows loading / error states as appropriate.
 */
async function loadData() {
  showState('loading');
  try {
    const res = await fetch('./customer_feedback.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.statusText}`);
    const json = await res.json();
    // Normalise each record and store
    rawData = json.map(normaliseRecord);
    filteredData = [...rawData];
    bootstrapDashboard();
    showState('dashboard');
  } catch (err) {
    document.getElementById('error-message').textContent =
      `${err.message}. Pastikan file customer_feedback.json berada di folder yang sama dengan index.html.`;
    showState('error');
  }
}

/**
 * Toggle visibility between loading, error, and dashboard panels.
 * @param {'loading'|'error'|'dashboard'} state
 */
function showState(state) {
  document.getElementById('loading-state').classList.toggle('hidden', state !== 'loading');
  document.getElementById('error-state').classList.toggle('hidden', state !== 'error');
  document.getElementById('dashboard-content').classList.toggle('hidden', state !== 'dashboard');
}

// ─── NORMALISATION ─────────────────────────────────────────────────────────────

/**
 * Normalise a raw JSON record to a consistent shape.
 * Supports variations in field names from the PRDECT-ID dataset.
 */
function normaliseRecord(row) {
  return {
    category:       normaliseStr(row['Category'] ?? row['Product Category'] ?? ''),
    productName:    normaliseStr(row['Product Name'] ?? row['product_name'] ?? ''),
    location:       normaliseStr(row['Location'] ?? row['location'] ?? '').trim(),
    price:          parseFloatSafe(row['Price'] ?? row['price']),
    overallRating:  parseFloatSafe(row['Overall Rating'] ?? row['overall_rating']),
    numberSold:     parseFloatSafe(row['Number Sold'] ?? row['number_sold']),
    totalReview:    parseFloatSafe(row['Total Review'] ?? row['total_review']),
    customerRating: parseInt(row['Customer Rating'] ?? row['customer_rating'] ?? '0', 10),
    reviewText:     normaliseStr(row['Customer Review'] ?? row['review_text'] ?? ''),
    sentiment:      normaliseSentiment(row['Sentiment'] ?? row['sentiment'] ?? ''),
    emotion:        normaliseEmotion(row['Emotion'] ?? row['emotion'] ?? ''),
  };
}

/** Normalise sentiment label to Positive / Negative / Neutral */
function normaliseSentiment(raw) {
  const s = String(raw).trim().toLowerCase();
  if (['positive', 'positif', 'bagus', 'baik'].includes(s))  return 'Positive';
  if (['negative', 'negatif', 'buruk', 'jelek'].includes(s)) return 'Negative';
  if (['neutral', 'netral', 'normal', 'biasa'].includes(s))  return 'Neutral';
  return raw ? capitalise(String(raw).trim()) : '';
}

/** Normalise emotion label to Title Case */
function normaliseEmotion(raw) {
  const s = String(raw).trim();
  return s ? capitalise(s) : '';
}

/** Trim and capitalise first letter */
function normaliseStr(val) {
  return val != null ? String(val).trim() : '';
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function parseFloatSafe(val) {
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── BOOTSTRAP ─────────────────────────────────────────────────────────────────

/** Called once after data is loaded; sets up filters, renders everything */
function bootstrapDashboard() {
  populateFilters();
  setupFilterListeners();
  setupSearch();
  renderAll();

  // Update header badge
  const badge = document.getElementById('header-badge');
  badge.textContent = `${rawData.length.toLocaleString('id')} ulasan dimuat`;
  badge.classList.remove('hidden');
}

// ─── FILTER POPULATION ─────────────────────────────────────────────────────────

/**
 * Populate all <select> filter dropdowns from the raw dataset.
 * Only include values that actually exist in the data.
 */
function populateFilters() {
  const sentiments = [...new Set(rawData.map(r => r.sentiment).filter(Boolean))].sort();
  const emotions   = [...new Set(rawData.map(r => r.emotion).filter(Boolean))].sort();
  const categories = [...new Set(rawData.map(r => r.category).filter(Boolean))].sort();
  const locations  = [...new Set(rawData.map(r => r.location).filter(Boolean))].sort();

  populateSelect('filter-sentiment', sentiments);
  populateSelect('filter-emotion', emotions);
  populateSelect('filter-category', categories);
  populateSelect('filter-location', locations);
}

function populateSelect(id, values) {
  const sel = document.getElementById(id);
  // Keep existing first option (the "All …" option)
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

// ─── FILTER LOGIC ──────────────────────────────────────────────────────────────

/** Attach change listeners to all filter selects and reset button */
function setupFilterListeners() {
  ['filter-sentiment','filter-emotion','filter-category','filter-location','filter-rating']
    .forEach(id => {
      document.getElementById(id).addEventListener('change', applyFilters);
    });

  document.getElementById('btn-reset').addEventListener('click', resetFilters);
}

/** Read all filter values, compute filteredData, and re-render */
function applyFilters() {
  const sentiment = document.getElementById('filter-sentiment').value;
  const emotion   = document.getElementById('filter-emotion').value;
  const category  = document.getElementById('filter-category').value;
  const location  = document.getElementById('filter-location').value;
  const rating    = document.getElementById('filter-rating').value;

  filteredData = rawData.filter(r => {
    if (sentiment && r.sentiment !== sentiment) return false;
    if (emotion   && r.emotion   !== emotion)   return false;
    if (category  && r.category  !== category)  return false;
    if (location  && r.location  !== location)  return false;
    if (rating    && r.customerRating !== parseInt(rating, 10)) return false;
    return true;
  });

  currentPage = 1;
  renderAll();
}

/** Reset all filters and re-render */
function resetFilters() {
  ['filter-sentiment','filter-emotion','filter-category','filter-location','filter-rating']
    .forEach(id => { document.getElementById(id).value = ''; });
  searchQuery = '';
  document.getElementById('table-search').value = '';
  filteredData = [...rawData];
  currentPage = 1;
  renderAll();
}

// ─── SEARCH ────────────────────────────────────────────────────────────────────

function setupSearch() {
  const input = document.getElementById('table-search');
  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    currentPage = 1;
    renderTable(); // only re-render table on search; charts stay the same
  });
}

// ─── RENDER ALL ────────────────────────────────────────────────────────────────

/** Master render function — updates every panel */
function renderAll() {
  renderKPIs();
  renderInsights();
  renderCharts();
  renderTable();
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function renderKPIs() {
  const total    = filteredData.length;
  const positive = filteredData.filter(r => r.sentiment === 'Positive').length;
  const negative = filteredData.filter(r => r.sentiment === 'Negative').length;
  const avgRating = total
    ? (filteredData.reduce((s, r) => s + r.customerRating, 0) / total)
    : 0;

  document.getElementById('kpi-total').textContent         = total.toLocaleString('id');
  document.getElementById('kpi-positive-rate').textContent = total
    ? `${((positive / total) * 100).toFixed(1)}%` : '—';
  document.getElementById('kpi-avg-rating').textContent    = total
    ? avgRating.toFixed(2) : '—';
  document.getElementById('kpi-negative').textContent      = negative.toLocaleString('id');
}

// ─── INSIGHTS ─────────────────────────────────────────────────────────────────

function renderInsights() {
  const grid = document.getElementById('insights-grid');
  grid.innerHTML = '';

  const insights = computeInsights();
  insights.forEach(ins => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    card.innerHTML = `
      <p class="insight-label">${ins.label}</p>
      <p class="insight-value">${ins.value}</p>
      ${ins.sub ? `<p class="insight-sub">${ins.sub}</p>` : ''}
    `;
    grid.appendChild(card);
  });
}

/**
 * Compute the four automatic insight blurbs from filteredData.
 * Returns an array of {label, value, sub?} objects.
 */
function computeInsights() {
  const data = filteredData;
  if (!data.length) return [];

  // 1. Category with highest positive sentiment %
  const catPositiveInsight = (() => {
    const catMap = groupBy(data, 'category');
    let best = null, bestPct = -1;
    Object.entries(catMap).forEach(([cat, rows]) => {
      if (rows.length < 5) return; // skip tiny groups
      const pct = rows.filter(r => r.sentiment === 'Positive').length / rows.length;
      if (pct > bestPct) { bestPct = pct; best = cat; }
    });
    return best
      ? { label: '🏆 Kategori Positif Tertinggi', value: best, sub: `${(bestPct * 100).toFixed(1)}% sentimen positif` }
      : { label: '🏆 Kategori Positif Tertinggi', value: 'N/A', sub: '' };
  })();

  // 2. Category with most negative feedback
  const catNegativeInsight = (() => {
    const catMap = groupBy(data.filter(r => r.sentiment === 'Negative'), 'category');
    let most = null, mostCount = 0;
    Object.entries(catMap).forEach(([cat, rows]) => {
      if (rows.length > mostCount) { mostCount = rows.length; most = cat; }
    });
    return most
      ? { label: '⚠️ Kategori Negatif Terbanyak', value: most, sub: `${mostCount} feedback negatif` }
      : { label: '⚠️ Kategori Negatif Terbanyak', value: 'N/A', sub: '' };
  })();

  // 3. Dominant emotion
  const emotionInsight = (() => {
    const emotionMap = groupBy(data.filter(r => r.emotion), 'emotion');
    let top = null, topCount = 0;
    Object.entries(emotionMap).forEach(([e, rows]) => {
      if (rows.length > topCount) { topCount = rows.length; top = e; }
    });
    const pct = data.length ? ((topCount / data.length) * 100).toFixed(1) : 0;
    return top
      ? { label: '😊 Emosi Dominan', value: top, sub: `${topCount.toLocaleString('id')} ulasan (${pct}%)` }
      : { label: '😊 Emosi Dominan', value: 'N/A', sub: '' };
  })();

  // 4. Location with most reviews
  const locationInsight = (() => {
    const locMap = groupBy(data, 'location');
    let topLoc = null, topLocCount = 0;
    Object.entries(locMap).forEach(([loc, rows]) => {
      if (!loc) return;
      if (rows.length > topLocCount) { topLocCount = rows.length; topLoc = loc; }
    });
    return topLoc
      ? { label: '📍 Lokasi Terbanyak', value: topLoc, sub: `${topLocCount.toLocaleString('id')} ulasan` }
      : { label: '📍 Lokasi Terbanyak', value: 'N/A', sub: '' };
  })();

  return [catPositiveInsight, catNegativeInsight, emotionInsight, locationInsight];
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────

/**
 * Render (or update) all ten Chart.js charts.
 * Each helper destroys its previous instance before creating a new one.
 */
function renderCharts() {
  renderSentimentDoughnut();
  renderEmotionChart();
  renderRatingDistribution();
  renderSentimentPerCategory();
  renderAvgRatingPerCategory();
  renderNegativeByCategory();
  renderTopLocations();
  renderTopProducts();
  renderPriceVsRating();
  renderKeywords();
}

/** Destroy a previous chart instance (if any) and return the canvas context */
function getCtx(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  return document.getElementById(id).getContext('2d');
}

// 1. Sentiment Doughnut Chart
function renderSentimentDoughnut() {
  const counts = countBy(filteredData, 'sentiment');
  const labels = Object.keys(counts);
  const values = labels.map(l => counts[l]);
  const colors = labels.map(l => sentimentColor(l));

  const ctx = getCtx('chart-sentiment-dist');
  charts['chart-sentiment-dist'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed.toLocaleString('id')} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// 2. Emotion Distribution Doughnut
function renderEmotionChart() {
  const counts = countBy(filteredData.filter(r => r.emotion), 'emotion');
  const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const values = labels.map(l => counts[l]);
  const colors = labels.map(l => PALETTE.emotions[l.toLowerCase()] ?? PALETTE.series[5]);

  const ctx = getCtx('chart-emotion-dist');
  charts['chart-emotion-dist'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed.toLocaleString('id')} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// 3. Customer Rating Distribution Bar
function renderRatingDistribution() {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  filteredData.forEach(r => {
    if (r.customerRating >= 1 && r.customerRating <= 5) counts[r.customerRating]++;
  });
  const labels = ['★1', '★2', '★3', '★4', '★5'];
  const values = [counts[1], counts[2], counts[3], counts[4], counts[5]];

  const ctx = getCtx('chart-rating-dist');
  charts['chart-rating-dist'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e'],
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
      },
    },
  });
}

// 4. Sentiment per Category – Stacked Bar
function renderSentimentPerCategory() {
  const catMap = groupBy(filteredData, 'category');
  // Use all sentiment keys present in filtered data
  const sentimentKeys = [...new Set(filteredData.map(r => r.sentiment).filter(Boolean))];

  const sortedCats = Object.keys(catMap)
    .filter(c => c)
    .sort((a, b) => catMap[b].length - catMap[a].length)
    .slice(0, 20); // top 20 categories

  const datasets = sentimentKeys.map((s, i) => ({
    label: s,
    data: sortedCats.map(cat => catMap[cat].filter(r => r.sentiment === s).length),
    backgroundColor: sentimentColor(s),
    borderRadius: 4,
  }));

  const ctx = getCtx('chart-sentiment-category');
  charts['chart-sentiment-category'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: sortedCats, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

// 5. Average Customer Rating per Category – Horizontal Bar
function renderAvgRatingPerCategory() {
  const catMap = groupBy(filteredData, 'category');
  const entries = Object.entries(catMap)
    .filter(([c]) => c)
    .map(([cat, rows]) => ({
      cat,
      avg: rows.reduce((s, r) => s + r.customerRating, 0) / rows.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20);

  const ctx = getCtx('chart-avg-rating-category');
  charts['chart-avg-rating-category'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e.cat),
      datasets: [{
        label: 'Avg. Rating',
        data: entries.map(e => parseFloat(e.avg.toFixed(2))),
        backgroundColor: entries.map(e => ratingColor(e.avg)),
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { beginAtZero: false, min: 1, max: 5, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

// 6. Negative Feedback by Category – Bar
function renderNegativeByCategory() {
  const negData = filteredData.filter(r => r.sentiment === 'Negative');
  const catMap  = groupBy(negData, 'category');
  const entries = Object.entries(catMap)
    .filter(([c]) => c)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  const ctx = getCtx('chart-negative-category');
  charts['chart-negative-category'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        label: 'Negative Feedback',
        data: entries.map(e => e[1].length),
        backgroundColor: '#ef444466',
        borderColor: '#ef4444',
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
      },
    },
  });
}

// 7. Top 10 Locations by Feedback Volume – Horizontal Bar
function renderTopLocations() {
  const locMap = groupBy(filteredData.filter(r => r.location), 'location');
  const top10  = Object.entries(locMap)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  const ctx = getCtx('chart-top-locations');
  charts['chart-top-locations'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(e => e[0]),
      datasets: [{
        label: 'Feedback Count',
        data: top10.map(e => e[1].length),
        backgroundColor: PALETTE.brand + 'bb',
        borderColor: PALETTE.brand,
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

// 8. Top 10 Products by Avg Customer Rating – Horizontal Bar
function renderTopProducts() {
  const prodMap = groupBy(filteredData.filter(r => r.productName), 'productName');
  const top10 = Object.entries(prodMap)
    .filter(([, rows]) => rows.length >= 3) // at least 3 reviews
    .map(([name, rows]) => ({
      name: name.length > 40 ? name.slice(0, 40) + '…' : name,
      avg: rows.reduce((s, r) => s + r.customerRating, 0) / rows.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  const ctx = getCtx('chart-top-products');
  charts['chart-top-products'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(e => e.name),
      datasets: [{
        label: 'Avg. Rating',
        data: top10.map(e => parseFloat(e.avg.toFixed(2))),
        backgroundColor: '#f59e0bbb',
        borderColor: '#f59e0b',
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { beginAtZero: false, min: 1, max: 5, grid: { color: '#f1f5f9' } },
        y: { ticks: { font: { size: 9 } }, grid: { display: false } },
      },
    },
  });
}

// 9. Price vs Customer Rating – Scatter Plot
function renderPriceVsRating() {
  // Sample up to 1000 points for performance
  const sample = sampleData(filteredData.filter(r => r.price > 0 && r.customerRating > 0), 1000);

  // Group by sentiment for colour coding
  const bySentiment = groupBy(sample, 'sentiment');
  const datasets = Object.entries(bySentiment).map(([s, rows]) => ({
    label: s,
    data: rows.map(r => ({ x: r.price, y: r.customerRating })),
    backgroundColor: sentimentColor(s) + '88',
    borderColor: sentimentColor(s),
    borderWidth: 0.5,
    pointRadius: 3,
    pointHoverRadius: 5,
  }));

  const ctx = getCtx('chart-price-rating');
  charts['chart-price-rating'] = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `Rp${ctx.parsed.x.toLocaleString('id')} · ★${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Price (Rp)', font: { size: 11 } },
          ticks: {
            callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v,
            font: { size: 10 },
          },
          grid: { color: '#f1f5f9' },
        },
        y: {
          title: { display: true, text: 'Customer Rating', font: { size: 11 } },
          min: 0, max: 5.5,
          ticks: { stepSize: 1, font: { size: 10 } },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

// 10. Top Keywords from Reviews – Bar Chart
function renderKeywords() {
  const freqMap = {};
  filteredData.forEach(r => {
    if (!r.reviewText) return;
    const words = r.reviewText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    words.forEach(w => { freqMap[w] = (freqMap[w] ?? 0) + 1; });
  });

  const top20 = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const ctx = getCtx('chart-keywords');
  charts['chart-keywords'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top20.map(e => e[0]),
      datasets: [{
        label: 'Frequency',
        data: top20.map(e => e[1]),
        backgroundColor: PALETTE.series.slice(0, 20),
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: defaultTooltip() },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
      },
    },
  });
}

// ─── TABLE ─────────────────────────────────────────────────────────────────────

/** Render the paginated feedback table, respecting search query */
function renderTable() {
  const q = searchQuery.toLowerCase();

  // Apply search on top of filtered data
  const searched = q
    ? filteredData.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        r.reviewText.toLowerCase().includes(q)
      )
    : filteredData;

  const total = searched.length;
  const totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start  = (currentPage - 1) * ROWS_PER_PAGE;
  const slice  = searched.slice(start, start + ROWS_PER_PAGE);

  const tbody = document.getElementById('table-body');
  const empty = document.getElementById('table-empty');
  const count = document.getElementById('table-count');

  tbody.innerHTML = '';

  if (!total) {
    empty.classList.remove('hidden');
    count.textContent = '0 ulasan ditemukan';
  } else {
    empty.classList.add('hidden');
    count.textContent = `${total.toLocaleString('id')} ulasan ditemukan`;
    slice.forEach(r => tbody.appendChild(buildTableRow(r)));
  }

  updatePagination(total, totalPages);
}

/** Build a single <tr> element for one feedback record */
function buildTableRow(r) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="td-cell td-product" title="${escHtml(r.productName)}">${escHtml(r.productName) || '—'}</td>
    <td class="td-cell">${escHtml(r.category) || '—'}</td>
    <td class="td-cell">${escHtml(r.location) || '—'}</td>
    <td class="td-cell text-center">
      <span class="stars">${'★'.repeat(r.customerRating)}${'☆'.repeat(5 - r.customerRating)}</span>
      <span class="text-slate-500 text-xs">${r.customerRating}</span>
    </td>
    <td class="td-cell text-center">${sentimentBadge(r.sentiment)}</td>
    <td class="td-cell text-center">${emotionBadge(r.emotion)}</td>
    <td class="td-cell td-review" title="${escHtml(r.reviewText)}">
      "${escHtml(r.reviewText.slice(0, 90))}${r.reviewText.length > 90 ? '…' : ''}"
    </td>
  `;
  return tr;
}

// ─── PAGINATION ────────────────────────────────────────────────────────────────

function updatePagination(total, totalPages) {
  const info    = document.getElementById('pagination-info');
  const pages   = document.getElementById('pagination-pages');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  const start = total === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const end   = Math.min(currentPage * ROWS_PER_PAGE, total);
  info.textContent = `Menampilkan ${start}–${end} dari ${total.toLocaleString('id')} ulasan`;

  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;

  btnPrev.onclick = () => { currentPage--; renderTable(); };
  btnNext.onclick = () => { currentPage++; renderTable(); };

  // Page number buttons (max 7 visible)
  pages.innerHTML = '';
  const pageNums = getPageRange(currentPage, totalPages);
  pageNums.forEach(p => {
    const btn = document.createElement('button');
    if (p === '…') {
      btn.className = 'page-number ellipsis';
      btn.textContent = '…';
    } else {
      btn.className = `page-number${p === currentPage ? ' active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => { currentPage = p; renderTable(); };
    }
    pages.appendChild(btn);
  });
}

/**
 * Generate an array of page numbers (and '…' ellipsis) for pagination.
 * Always shows first, last, current ±2.
 */
function getPageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, cur, cur - 1, cur - 2, cur + 1, cur + 2].filter(p => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

// ─── BADGE HELPERS ─────────────────────────────────────────────────────────────

function sentimentBadge(s) {
  const map = {
    'Positive': ['badge-positive', '✓ Positive'],
    'Negative': ['badge-negative', '✗ Negative'],
    'Neutral':  ['badge-neutral',  '– Neutral'],
  };
  const [cls, label] = map[s] ?? ['badge-default', s || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function emotionBadge(e) {
  const map = {
    'Happy':   'badge-happy',
    'Anger':   'badge-anger',
    'Fear':    'badge-fear',
    'Love':    'badge-love',
    'Sadness': 'badge-sadness',
  };
  const cls = map[e] ?? 'badge-default';
  return e ? `<span class="badge ${cls}">${e}</span>` : '<span class="text-slate-400">—</span>';
}

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────

/** Group an array of objects by a key */
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] ?? '';
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/** Count occurrences by a key */
function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] ?? 'Unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

/** Random sample without replacement (for scatter performance) */
function sampleData(arr, n) {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Resolve a colour string for a given sentiment label */
function sentimentColor(s) {
  if (!s) return '#94a3b8';
  const k = s.toLowerCase();
  if (k === 'positive') return PALETTE.positive;
  if (k === 'negative') return PALETTE.negative;
  if (k === 'neutral')  return PALETTE.neutral;
  return '#94a3b8';
}

/** Rating-to-colour gradient: red ➜ amber ➜ green */
function ratingColor(avg) {
  if (avg >= 4.5) return '#22c55e';
  if (avg >= 4.0) return '#84cc16';
  if (avg >= 3.0) return '#f59e0b';
  if (avg >= 2.0) return '#f97316';
  return '#ef4444';
}

/** Standard tooltip configuration for simple bar charts */
function defaultTooltip() {
  return {
    callbacks: {
      label: ctx => ` ${ctx.dataset.label ?? 'Value'}: ${
        typeof ctx.parsed.y === 'number'
          ? ctx.parsed.y.toLocaleString('id')
          : ctx.parsed.x.toLocaleString('id')
      }`,
    },
  };
}

/** Escape HTML entities to prevent XSS in dynamic innerHTML */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
