/* =========================================================
   Temperature Matrix (Last 10 Years) — D3 v7
   - Matrix: columns = years, rows = months
   - Cell color: monthly MAX or monthly MIN (toggle on click)
   - Cell sparkline: daily values within the month (MAX/MIN mode)
   - Tooltip on hover
   - Color legend
   ========================================================= */

// ---------- 1) CONFIG ----------
const CFG = {
  lastNYears: 10,
  svgWidth: 1120,
  svgHeight: 640,
  margin: { top: 64, right: 24, bottom: 64, left: 88 },

  cellCornerRadius: 6,
  sparkPad: { x: 6, y: 6 },
  tooltipOffset: { x: 14, y: 14 },

  monthNames: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],

  legend: { width: 260, height: 12, ticks: 5 }
};

// Auto-detection hints (works if headers match common names)
const COLUMN_HINTS = {
  date: ["date", "Date", "DATE", "day", "DAY", "timestamp", "time"],
  tmax: ["tmax", "TMAX", "max", "MAX", "temp_max", "TempMax"],
  tmin: ["tmin", "TMIN", "min", "MIN", "temp_min", "TempMin"]
};

// ---------- 2) STATE ----------
const state = {
  mode: "max", // "max" | "min"
  cells: [],
  years: [],
  colorScale: null,
  xBand: null,
  yBand: null
};

// ---------- 3) DOM ----------
const svg = d3.select("#chart").attr("viewBox", `0 0 ${CFG.svgWidth} ${CFG.svgHeight}`);
const gRoot = svg.append("g").attr("class", "root");
const tooltip = d3.select("#tooltip");
const modeLabel = d3.select("#modeLabel");

// ---------- 4) HELPERS ----------
function monthLabel(mIndex) {
  return CFG.monthNames[mIndex] ?? String(mIndex + 1);
}

function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

function formatNumber(x) {
  if (x == null || Number.isNaN(x)) return "NA";
  const n = +x;
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
}

function pickColumn(sampleRow, candidates) {
  for (const k of candidates) {
    if (sampleRow[k] !== undefined && sampleRow[k] !== null && String(sampleRow[k]).trim() !== "") return k;
  }
  return null;
}

/** Robust date parsing:
 *  - "YYYY-MM-DD"
 *  - "YYYY/MM/DD"
 *  - "YYYYMMDD"
 *  - JS Date-parseable formats
 */
function parseDateSmart(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6) - 1;
    const d = +s.slice(6, 8);
    const dt = new Date(y, m, d);
    return Number.isNaN(+dt) ? null : dt;
  }

  // Try native parse
  const dt = new Date(s);
  if (!Number.isNaN(+dt)) return dt;

  return null;
}

/** Some datasets store temperatures in tenths (e.g., 215 => 21.5).
 *  Heuristic: if |temp| > 80, divide by 10.
 */
function scaleTempIfNeeded(v) {
  if (!Number.isFinite(v)) return v;
  return Math.abs(v) > 80 ? v / 10 : v;
}

function updateModePill() {
  const isMax = state.mode === "max";
  modeLabel.text(isMax ? "MAX" : "MIN");
  modeLabel.classed("mode-max", isMax).classed("mode-min", !isMax);
}

// ---------- 5) ROW PARSER (WITH FALLBACK FOR UNKNOWN HEADERS) ----------
function makeRowParser(sampleRow) {
  const keys = Object.keys(sampleRow);

  let dateKey = pickColumn(sampleRow, COLUMN_HINTS.date);
  let maxKey  = pickColumn(sampleRow, COLUMN_HINTS.tmax);
  let minKey  = pickColumn(sampleRow, COLUMN_HINTS.tmin);

  // ✅ FALLBACK: if detection fails AND there are exactly 3 columns, map them in order
  if (!dateKey || !maxKey || !minKey) {
    console.warn("Column detection failed. Falling back to positional mapping (col1=date, col2=tmax, col3=tmin).");
    console.warn("First row keys:", keys);

    if (keys.length >= 3) {
      dateKey = keys[0];
      maxKey  = keys[1];
      minKey  = keys[2];
    }
  }

  // If still missing, stop early with clear logs
  if (!dateKey || !maxKey || !minKey) {
    console.error("Could not determine CSV columns for date/tmax/tmin. Please rename headers or update COLUMN_HINTS.");
    console.error("Detected:", { dateKey, maxKey, minKey });
    console.error("Available keys:", keys);
  } else {
    console.log("Using columns:", { dateKey, maxKey, minKey });
  }

  return function parseRow(d) {
    const dt = parseDateSmart(d[dateKey]);
    if (!dt) return null;

    const tmax = scaleTempIfNeeded(+d[maxKey]);
    const tmin = scaleTempIfNeeded(+d[minKey]);

    return {
      date: dt,
      year: dt.getFullYear(),
      month: dt.getMonth(),
      day: dt.getDate(),
      tmax,
      tmin
    };
  };
}

// ---------- 6) DATA PIPELINE ----------
function filterLastNYears(rows, n) {
  const maxYear = d3.max(rows, r => r.year);
  const minYear = maxYear - (n - 1);
  return rows.filter(r => r.year >= minYear && r.year <= maxYear);
}

function buildCells(rows) {
  const grouped = d3.group(rows, r => r.year, r => r.month);
  const years = Array.from(grouped.keys()).sort((a, b) => a - b);

  const cells = [];
  for (const year of years) {
    const monthsMap = grouped.get(year);

    for (let m = 0; m < 12; m++) {
      const series = (monthsMap && monthsMap.get(m)) ? monthsMap.get(m).slice() : [];
      series.sort((a, b) => a.date - b.date);

      const monthlyMax = series.length ? d3.max(series, d => d.tmax) : null;
      const monthlyMin = series.length ? d3.min(series, d => d.tmin) : null;

      const minOfMax = series.length ? d3.min(series, d => d.tmax) : null;
      const maxOfMin = series.length ? d3.max(series, d => d.tmin) : null;

      cells.push({
        key: `${year}-${m}`,
        year,
        month: m,
        series,
        monthlyMax,
        monthlyMin,
        minOfMax,
        maxOfMin
      });
    }
  }

  return { cells, years };
}

function computeGlobalDomain(cells) {
  const vals = [];
  for (const c of cells) {
    if (c.monthlyMax != null) vals.push(c.monthlyMax);
    if (c.monthlyMin != null) vals.push(c.monthlyMin);
  }
  const lo = d3.min(vals);
  const hi = d3.max(vals);
  const pad = (hi - lo) * 0.02 || 1;
  return [lo - pad, hi + pad];
}

function createBandScales(years) {
  const innerW = CFG.svgWidth - CFG.margin.left - CFG.margin.right;
  const innerH = CFG.svgHeight - CFG.margin.top - CFG.margin.bottom;

  const xBand = d3.scaleBand()
    .domain(years)
    .range([CFG.margin.left, CFG.margin.left + innerW])
    .paddingInner(0.08);

  const yBand = d3.scaleBand()
    .domain(d3.range(12))
    .range([CFG.margin.top, CFG.margin.top + innerH])
    .paddingInner(0.08);

  return { xBand, yBand };
}

function createColorScale(domain) {
  return d3.scaleSequential()
    .domain(domain)
    .interpolator(d3.interpolateTurbo);
}

// ---------- 7) AXES ----------
function renderAxes(xBand, yBand) {
  gRoot.selectAll(".axis").remove();

  const xAxis = d3.axisBottom(xBand).tickSizeOuter(0);
  const yAxis = d3.axisLeft(yBand).tickFormat(m => monthLabel(m)).tickSizeOuter(0);

  gRoot.append("g")
    .attr("class", "axis axis-x")
    .attr("transform", `translate(0, ${CFG.svgHeight - CFG.margin.bottom + 18})`)
    .call(xAxis);

  gRoot.append("g")
    .attr("class", "axis axis-y")
    .attr("transform", `translate(${CFG.margin.left - 10}, 0)`)
    .call(yAxis);

  gRoot.append("text")
    .attr("x", CFG.margin.left)
    .attr("y", CFG.margin.top - 30)
    .attr("fill", "rgba(255,255,255,0.82)")
    .attr("font-size", 13)
    .attr("font-weight", 700)
    .text("Months × Years");

  gRoot.append("text")
    .attr("x", CFG.svgWidth / 2)
    .attr("y", CFG.svgHeight - 18)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255,255,255,0.65)")
    .attr("font-size", 12)
    .text("Year");
}

// ---------- 8) LEGEND ----------
function renderLegend(colorScale, domain) {
  const legendDiv = d3.select("#legend");
  legendDiv.html("");

  legendDiv.append("span")
    .attr("class", "legend-title")
    .text("Temperature scale");

  const w = CFG.legend.width;
  const h = CFG.legend.height;

  const legendSvg = legendDiv.append("svg")
    .attr("width", w)
    .attr("height", 36);

  const defs = legendSvg.append("defs");
  const gradId = "temp-grad";
  const grad = defs.append("linearGradient")
    .attr("id", gradId)
    .attr("x1", "0%").attr("x2", "100%")
    .attr("y1", "0%").attr("y2", "0%");

  const stops = 18;
  const [d0, d1] = domain;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const v = d0 + t * (d1 - d0);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(v));
  }

  legendSvg.append("rect")
    .attr("x", 0)
    .attr("y", 6)
    .attr("width", w)
    .attr("height", h)
    .attr("rx", 6)
    .attr("ry", 6)
    .attr("fill", `url(#${gradId})`)
    .attr("stroke", "rgba(255,255,255,0.18)");

  const tickVals = d3.ticks(d0, d1, CFG.legend.ticks);
  const x = d3.scaleLinear().domain([d0, d1]).range([0, w]);

  legendSvg.selectAll(".leg-tick")
    .data(tickVals)
    .enter()
    .append("text")
    .attr("x", v => x(v))
    .attr("y", 32)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255,255,255,0.72)")
    .attr("font-size", 11)
    .text(v => formatNumber(v));
}

// ---------- 9) TOOLTIP ----------
function showTooltip(event, cell) {
  const val = state.mode === "max" ? cell.monthlyMax : cell.monthlyMin;
  const title = `${cell.year} • ${monthLabel(cell.month)}`;

  const rangeLo = state.mode === "max" ? cell.minOfMax : cell.monthlyMin;
  const rangeHi = state.mode === "max" ? cell.monthlyMax : cell.maxOfMin;

  tooltip
    .style("opacity", 1)
    .html(`
      <div class="tt-title">${title}</div>
      <div class="tt-row"><span>${state.mode.toUpperCase()} value</span><b>${formatNumber(val)}</b></div>
      <div class="tt-row"><span>Days in data</span><b>${cell.series.length}</b></div>
      <div class="tt-row"><span>Range</span><b>${formatNumber(rangeLo)} → ${formatNumber(rangeHi)}</b></div>
    `);

  moveTooltip(event);
}

function moveTooltip(event) {
  const padding = 12;
  const pageW = window.innerWidth;
  const pageH = window.innerHeight;

  const box = tooltip.node().getBoundingClientRect();
  const x = clamp(event.pageX + CFG.tooltipOffset.x, padding, pageW - box.width - padding);
  const y = clamp(event.pageY + CFG.tooltipOffset.y, padding, pageH - box.height - padding);

  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// ---------- 10) SPARKLINE ----------
function sparklinePath(cell, cellW, cellH) {
  const series = cell.series;
  if (!series || series.length < 2) return "";

  const px = CFG.sparkPad.x;
  const py = CFG.sparkPad.y;

  const innerW = Math.max(1, cellW - 2 * px);
  const innerH = Math.max(1, cellH - 2 * py);

  const x = d3.scaleLinear()
    .domain([0, series.length - 1])
    .range([px, px + innerW]);

  const vals = series.map(d => state.mode === "max" ? d.tmax : d.tmin);
  const lo = d3.min(vals);
  const hi = d3.max(vals);

  const span = (hi - lo);
  const pad = span === 0 ? 1 : span * 0.08;

  const y = d3.scaleLinear()
    .domain([lo - pad, hi + pad])
    .range([py + innerH, py]);

  const line = d3.line()
    .defined(v => v != null && !Number.isNaN(v))
    .x((v, i) => x(i))
    .y(v => y(v))
    .curve(d3.curveMonotoneX);

  return line(vals);
}

// ---------- 11) RENDER / UPDATE ----------
function cellFill(cell) {
  const v = state.mode === "max" ? cell.monthlyMax : cell.monthlyMin;
  if (v == null || Number.isNaN(v)) return "rgba(255,255,255,0.05)";
  return state.colorScale(v);
}

function renderMatrix() {
  gRoot.selectAll(".matrix-layer").remove();

  const layer = gRoot.append("g").attr("class", "matrix-layer");

  const xBand = state.xBand;
  const yBand = state.yBand;

  const cellW = xBand.bandwidth();
  const cellH = yBand.bandwidth();

  const groups = layer.selectAll(".cell-group")
    .data(state.cells, d => d.key)
    .enter()
    .append("g")
    .attr("class", "cell-group")
    .attr("transform", d => `translate(${xBand(d.year)}, ${yBand(d.month)})`)
    .on("mouseover", (event, d) => showTooltip(event, d))
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseout", () => hideTooltip());

  groups.append("rect")
    .attr("class", "cell-rect")
    .attr("width", cellW)
    .attr("height", cellH)
    .attr("rx", CFG.cellCornerRadius)
    .attr("ry", CFG.cellCornerRadius)
    .attr("fill", d => cellFill(d));

  groups.append("path")
    .attr("class", "sparkline")
    .attr("d", d => sparklinePath(d, cellW, cellH));

  groups.filter(d => !d.series || d.series.length === 0)
    .append("text")
    .attr("x", cellW / 2)
    .attr("y", cellH / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255,255,255,0.55)")
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .text("NA");
}

function updateMatrix() {
  const xBand = state.xBand;
  const cellW = xBand.bandwidth();
  const cellH = state.yBand.bandwidth();

  gRoot.selectAll(".cell-rect")
    .transition()
    .duration(240)
    .attr("fill", d => cellFill(d));

  gRoot.selectAll(".sparkline")
    .transition()
    .duration(240)
    .attr("d", d => sparklinePath(d, cellW, cellH));

  updateModePill();
}

function toggleMode() {
  state.mode = (state.mode === "max") ? "min" : "max";
  updateMatrix();
}

svg.on("click", () => toggleMode());

// ---------- 12) INIT ----------
async function init() {
  updateModePill();

  const raw = await d3.csv("temperature_daily.csv");
  if (!raw || raw.length === 0) {
    console.error("CSV is empty or could not be loaded.");
    return;
  }

  console.log("CSV columns:", Object.keys(raw[0]));
  console.log("First row sample:", raw[0]);

  const parser = makeRowParser(raw[0]);

  const rows = raw
    .map(parser)
    .filter(d => d !== null)
    .filter(d => d.date instanceof Date && !Number.isNaN(+d.date))
    .filter(d => Number.isFinite(d.tmax) || Number.isFinite(d.tmin));

  console.log("Parsed rows:", rows.length);
  console.log("Parsed sample:", rows.slice(0, 5));

  const filtered = filterLastNYears(rows, CFG.lastNYears);
  console.log("Filtered (last 10 years) rows:", filtered.length);

  const built = buildCells(filtered);
  state.cells = built.cells;
  state.years = built.years;

  const domain = computeGlobalDomain(state.cells);
  state.colorScale = createColorScale(domain);

  const { xBand, yBand } = createBandScales(state.years);
  state.xBand = xBand;
  state.yBand = yBand;

  renderAxes(xBand, yBand);
  renderLegend(state.colorScale, domain);
  renderMatrix();
}

init().catch(err => console.error(err));