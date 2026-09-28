/**
 * script.js — Sales Dashboard 2024
 * ─────────────────────────────────────────────────────────────
 * Architecture:
 *  1. Load JSON  → rawData[]
 *  2. Populate filter dropdowns from raw data
 *  3. Apply filters → filteredData[]
 *  4. Compute KPIs from filteredData
 *  5. Build / update all Chart.js charts
 *  6. Filter change events re-trigger steps 3–5
 * ─────────────────────────────────────────────────────────────
 */

// ─── GLOBAL STATE ──────────────────────────────────────────────
let rawData     = [];   // full unfiltered dataset from JSON
let filteredData = [];  // currently active filtered dataset
let charts      = {};   // registry of Chart.js instances keyed by id

// ─── COLOUR PALETTE ────────────────────────────────────────────
// Consistent, accessible, soft palette used across all charts
const PALETTE = {
  blue:    '#3b82f6',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  cyan:    '#06b6d4',
  indigo:  '#6366f1',
  lime:    '#84cc16',
  orange:  '#f97316',
  pink:    '#ec4899',
};

// Ordered array for chart datasets
const COLORS = Object.values(PALETTE);

// Semi-transparent versions for fills
const COLORS_ALPHA = COLORS.map(c => c + '33');

// ─── CHART.JS GLOBAL DEFAULTS ──────────────────────────────────
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#6b7280';
Chart.defaults.plugins.legend.labels.boxWidth  = 12;
Chart.defaults.plugins.legend.labels.padding   = 14;
Chart.defaults.plugins.tooltip.cornerRadius    = 8;
Chart.defaults.plugins.tooltip.padding         = 10;
Chart.defaults.plugins.tooltip.titleFont       = { weight: '600', size: 12 };

// ─── ENTRY POINT ───────────────────────────────────────────────
/**
 * Bootstrap: fetch JSON, populate filters, render all visuals.
 */
async function init() {
  try {
    const response = await fetch('sales_data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rawData = await response.json();

    populateFilters();
    applyFiltersAndRender();
    bindFilterEvents();
  } catch (err) {
    console.error('Failed to load sales data:', err);
    document.querySelector('main').innerHTML =
      `<div class="text-center py-20 text-red-500 text-sm">
         ⚠️ Could not load <code>sales_data.json</code>. Serve this page via a local web server (e.g. <code>npx serve .</code>).
       </div>`;
  }
}

// ─── FILTER UTILITIES ──────────────────────────────────────────
/**
 * Populate each <select> with unique values derived from rawData.
 */
function populateFilters() {
  const regions    = unique(rawData, 'region');
  const categories = unique(rawData, 'product_category');
  const customers  = unique(rawData, 'customer_type');
  const channels   = unique(rawData, 'sales_channel');

  fillSelect('filter-region',   regions);
  fillSelect('filter-category', categories);
  fillSelect('filter-customer', customers);
  fillSelect('filter-channel',  channels);
}

/** Extract sorted unique values for a field */
function unique(data, field) {
  return [...new Set(data.map(d => d[field]))].sort();
}

/** Append <option> elements to a <select> by id */
function fillSelect(id, values) {
  const el = document.getElementById(id);
  values.forEach(v => {
    const opt  = document.createElement('option');
    opt.value  = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

/** Read current filter values from the DOM */
function getFilters() {
  return {
    region:   document.getElementById('filter-region').value,
    category: document.getElementById('filter-category').value,
    customer: document.getElementById('filter-customer').value,
    channel:  document.getElementById('filter-channel').value,
  };
}

/** Bind change events on all filter selects */
function bindFilterEvents() {
  ['filter-region', 'filter-category', 'filter-customer', 'filter-channel']
    .forEach(id => document.getElementById(id)
      .addEventListener('change', applyFiltersAndRender));

  // "Reset all" button in the header badge
  document.getElementById('btn-clear-all').addEventListener('click', resetFilters);
}

/** Reset all filters to "all" and re-render */
function resetFilters() {
  ['filter-region', 'filter-category', 'filter-customer', 'filter-channel']
    .forEach(id => { document.getElementById(id).value = 'all'; });
  applyFiltersAndRender();
}

// ─── CORE PIPELINE ─────────────────────────────────────────────
/**
 * Main pipeline: filter → KPI → charts → UI state.
 * Called once on init and on every filter change.
 */
function applyFiltersAndRender() {
  const f = getFilters();

  // Apply filters
  filteredData = rawData.filter(d =>
    (f.region   === 'all' || d.region            === f.region)   &&
    (f.category === 'all' || d.product_category  === f.category) &&
    (f.customer === 'all' || d.customer_type      === f.customer) &&
    (f.channel  === 'all' || d.sales_channel      === f.channel)
  );

  updateFilterBadge(f);
  updateEmptyState();

  if (filteredData.length > 0) {
    renderKPIs();
    renderAllCharts();
  }
}

/** Show / hide the active-filter badge in the header */
function updateFilterBadge(f) {
  const active = Object.values(f).filter(v => v !== 'all');
  const badge  = document.getElementById('filter-badge');
  const text   = document.getElementById('filter-badge-text');
  if (active.length > 0) {
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    text.textContent = `${active.length} filter${active.length > 1 ? 's' : ''} aktif`;
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

/** Toggle charts / empty state visibility */
function updateEmptyState() {
  const empty = document.getElementById('empty-state');
  const charts = document.querySelectorAll('.chart-card, section[aria-label="KPI Summary"]');
  if (filteredData.length === 0) {
    empty.classList.remove('hidden');
    empty.classList.add('flex');
    charts.forEach(el => el.classList.add('opacity-30', 'pointer-events-none'));
  } else {
    empty.classList.add('hidden');
    empty.classList.remove('flex');
    charts.forEach(el => el.classList.remove('opacity-30', 'pointer-events-none'));
  }
}

// ─── KPI COMPUTATION ───────────────────────────────────────────
/**
 * Compute KPIs from filteredData and push values into the DOM.
 * Revenue = quantity × unit_price × (1 − discount)
 */
function renderKPIs() {
  const totalRevenue = filteredData.reduce(
    (sum, d) => sum + d.quantity * d.unit_price * (1 - d.discount), 0
  );
  const totalTransactions = filteredData.length;
  const totalQty = filteredData.reduce((sum, d) => sum + d.quantity, 0);
  const avgDiscount = filteredData.reduce((sum, d) => sum + d.discount, 0) / totalTransactions;

  // Revenue per record (for stats)
  const revenuePerTx = totalRevenue / totalTransactions;

  setText('kpi-revenue',          formatCurrency(totalRevenue));
  setText('kpi-revenue-sub',      `Avg/tx: ${formatCurrency(revenuePerTx)}`);
  setText('kpi-transactions',     totalTransactions.toLocaleString('en-US'));
  setText('kpi-transactions-sub', `${filteredData.length} of ${rawData.length} records`);
  setText('kpi-quantity',         totalQty.toLocaleString('en-US'));
  setText('kpi-quantity-sub',     `Avg/tx: ${(totalQty / totalTransactions).toFixed(1)} units`);
  setText('kpi-discount',         (avgDiscount * 100).toFixed(1) + '%');
  setText('kpi-discount-sub',     `Min ${(Math.min(...filteredData.map(d=>d.discount))*100).toFixed(0)}% · Max ${(Math.max(...filteredData.map(d=>d.discount))*100).toFixed(0)}%`);
}

// ─── HELPERS ───────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatCurrency(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

/**
 * Aggregate: group filteredData by a field and sum a computed value.
 * @param {string} groupField - field to group by
 * @param {function} valueFn  - function(record) returning a number
 * @returns {{ labels: string[], values: number[] }}
 */
function aggregate(groupField, valueFn) {
  const map = {};
  filteredData.forEach(d => {
    const key = d[groupField];
    map[key] = (map[key] || 0) + valueFn(d);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return {
    labels: sorted.map(e => e[0]),
    values: sorted.map(e => e[1]),
  };
}

/** Revenue for a single record */
const revenue = d => d.quantity * d.unit_price * (1 - d.discount);

// ─── CHART FACTORY ─────────────────────────────────────────────
/**
 * Destroy an existing chart and create a new one.
 * Handles the destroy-on-update pattern cleanly.
 */
function createChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, config);
}

// ─── RENDER ALL CHARTS ─────────────────────────────────────────
function renderAllCharts() {
  renderSalesTrend();
  renderRevenuePerRegion();
  renderRevenuePerCategory();
  renderSalesPerRep();
  renderCustomerType();
  renderPaymentMethod();
  renderSalesChannel();
  renderScatter();
  renderTop10();
  renderQtyPerCategory();
}

// ──────────────────────────────────────────────────────────────
// 1. SALES TREND — Monthly revenue line chart
// ──────────────────────────────────────────────────────────────
function renderSalesTrend() {
  // Group by YYYY-MM
  const map = {};
  filteredData.forEach(d => {
    const month = d.date.slice(0, 7); // "2024-01"
    map[month] = (map[month] || 0) + revenue(d);
  });

  // Sort chronologically
  const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([k]) => {
    const [y, m] = k.split('-');
    return new Date(+y, +m - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
  });
  const values = sorted.map(([, v]) => +v.toFixed(2));

  createChart('chart-trend', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        borderColor: PALETTE.blue,
        backgroundColor: PALETTE.blue + '18',
        borderWidth: 2.5,
        pointBackgroundColor: PALETTE.blue,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Revenue: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => formatCurrency(v) }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 2. REVENUE PER REGION — Doughnut chart
// ──────────────────────────────────────────────────────────────
function renderRevenuePerRegion() {
  const { labels, values } = aggregate('region', revenue);

  createChart('chart-region', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values.map(v => +v.toFixed(2)),
        backgroundColor: COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 3. REVENUE PER PRODUCT CATEGORY — Horizontal bar chart
// ──────────────────────────────────────────────────────────────
function renderRevenuePerCategory() {
  const { labels, values } = aggregate('product_category', revenue);

  createChart('chart-category', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values.map(v => +v.toFixed(2)),
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => formatCurrency(v) }
        },
        y: { grid: { display: false } }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 4. SALES PER SALES REP — Vertical bar chart
// ──────────────────────────────────────────────────────────────
function renderSalesPerRep() {
  const { labels, values } = aggregate('sales_rep', revenue);

  createChart('chart-salesrep', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values.map(v => +v.toFixed(2)),
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => formatCurrency(v) }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 5. CUSTOMER TYPE — Pie chart
// ──────────────────────────────────────────────────────────────
function renderCustomerType() {
  const { labels, values } = aggregate('customer_type', () => 1);

  createChart('chart-customer', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.blue, PALETTE.violet, PALETTE.emerald, PALETTE.amber],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 6. PAYMENT METHOD — Doughnut chart
// ──────────────────────────────────────────────────────────────
function renderPaymentMethod() {
  const { labels, values } = aggregate('payment_method', () => 1);

  createChart('chart-payment', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.cyan, PALETTE.orange, PALETTE.rose],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 7. SALES CHANNEL — Pie chart
// ──────────────────────────────────────────────────────────────
function renderSalesChannel() {
  const { labels, values } = aggregate('sales_channel', () => 1);

  createChart('chart-channel', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [PALETTE.indigo, PALETTE.lime],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 8. DISCOUNT vs SALES — Scatter plot
//    x = discount %, y = net revenue per transaction
// ──────────────────────────────────────────────────────────────
function renderScatter() {
  const points = filteredData.map(d => ({
    x: +(d.discount * 100).toFixed(1),
    y: +revenue(d).toFixed(2),
    label: d.product_name,
  }));

  createChart('chart-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Transaction',
        data: points,
        backgroundColor: PALETTE.blue + 'aa',
        borderColor: PALETTE.blue,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = ctx.raw;
              return [`${p.label}`, `Discount: ${p.x}%`, `Revenue: ${formatCurrency(p.y)}`];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount (%)' },
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => v + '%' }
        },
        y: {
          title: { display: true, text: 'Net Revenue' },
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => formatCurrency(v) }
        }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 9. TOP 10 HIGHEST SALES — Horizontal bar chart
//    Ranked by net revenue per transaction
// ──────────────────────────────────────────────────────────────
function renderTop10() {
  // Sort all records descending by revenue
  const sorted = [...filteredData]
    .map(d => ({ label: `#${d.id} ${d.product_name}`, value: revenue(d) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const labels = sorted.map(d => d.label);
  const values = sorted.map(d => +d.value.toFixed(2));

  createChart('chart-top10', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: COLORS.slice(0, 10),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => formatCurrency(v) }
        },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// 10. QUANTITY SOLD PER CATEGORY — Grouped bar (qty vs revenue)
// ──────────────────────────────────────────────────────────────
function renderQtyPerCategory() {
  const qtyAgg = aggregate('product_category', d => d.quantity);
  // Align revenue with same label order as qty
  const revMap = {};
  filteredData.forEach(d => {
    revMap[d.product_category] = (revMap[d.product_category] || 0) + revenue(d);
  });
  const revValues = qtyAgg.labels.map(l => +(revMap[l] || 0).toFixed(2));

  createChart('chart-qty-category', {
    type: 'bar',
    data: {
      labels: qtyAgg.labels,
      datasets: [
        {
          label: 'Qty Sold',
          data: qtyAgg.values,
          backgroundColor: PALETTE.blue + 'cc',
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: 'yQty',
        },
        {
          label: 'Revenue',
          data: revValues,
          backgroundColor: PALETTE.emerald + 'cc',
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: 'yRev',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 0) return ` Qty: ${ctx.parsed.y.toLocaleString('en-US')} units`;
              return ` Revenue: ${formatCurrency(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x:    { grid: { display: false } },
        yQty: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          title: { display: true, text: 'Qty Sold' },
          ticks: { stepSize: 50 },
        },
        yRev: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Revenue' },
          ticks: { callback: v => formatCurrency(v) },
        }
      }
    }
  });
}

// ─── INIT ──────────────────────────────────────────────────────
// Run when DOM is ready
document.addEventListener('DOMContentLoaded', init);
