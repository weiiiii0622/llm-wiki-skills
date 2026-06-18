const state = {
  manifest: null,
  graph: null,
  diagnostics: null,
  searchIndex: [],
  selectedId: null,
  query: "",
  filters: { type: new Set(), status: new Set(), tag: new Set() },
  focusDepth: 0,
  panels: {
    left: false,
    reader: false,
    nodes: false
  },
  transform: { x: 0, y: 0, scale: 1 },
  dragging: false,
  dragStart: null,
  apiSearchHealthy: true
};

const els = {
  app: document.querySelector("#app"),
  title: document.querySelector("#atlas-title"),
  status: document.querySelector("#atlas-status"),
  searchMode: document.querySelector("#search-mode"),
  share: document.querySelector("#share-button"),
  toggleLeft: document.querySelector("#toggle-left"),
  toggleReader: document.querySelector("#toggle-reader"),
  toggleNodes: document.querySelector("#toggle-nodes"),
  showLeft: document.querySelector("#show-left"),
  showReader: document.querySelector("#show-reader"),
  showNodes: document.querySelector("#show-nodes"),
  searchInput: document.querySelector("#search-input"),
  searchState: document.querySelector("#search-state"),
  resultList: document.querySelector("#result-list"),
  filterList: document.querySelector("#filter-list"),
  clearFilters: document.querySelector("#clear-filters"),
  healthLegend: document.querySelector("#health-legend"),
  focusDepth: document.querySelector("#focus-depth"),
  resetFocus: document.querySelector("#reset-focus"),
  canvas: document.querySelector("#graph-canvas"),
  message: document.querySelector("#graph-message"),
  nodeList: document.querySelector("#node-list"),
  reader: document.querySelector("#reader-panel"),
  readerTitle: document.querySelector("#reader-title"),
  readerMeta: document.querySelector("#reader-meta"),
  readerContent: document.querySelector("#reader-content"),
  readerLinks: document.querySelector("#reader-links"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  fit: document.querySelector("#fit-graph")
};

const ctx = els.canvas.getContext("2d");
const palette = ["--cat-a", "--cat-b", "--cat-c", "--cat-d", "--cat-e", "--cat-f"].map(cssVar);
const MIN_GRAPH_ZOOM_SCALE = 0.18;
const MAX_GRAPH_ZOOM_SCALE = 48;
const BUTTON_ZOOM_IN_FACTOR = 1.32;
const BUTTON_ZOOM_OUT_FACTOR = 0.76;
const WHEEL_ZOOM_IN_FACTOR = 1.14;
const WHEEL_ZOOM_OUT_FACTOR = 0.88;

boot().catch((error) => {
  els.app.classList.remove("loading");
  setGraphMessage(`Could not load atlas data: ${error.message}`);
});

async function boot() {
  bindEvents();
  readHash();
  const [manifest, graph, diagnostics, searchIndex] = await Promise.all([
    loadJson("atlas/manifest.json"),
    loadJson("atlas/graph.json"),
    loadJson("atlas/diagnostics.json"),
    loadJson("atlas/search-index.json")
  ]);
  state.manifest = manifest;
  state.graph = graph;
  state.diagnostics = diagnostics;
  state.searchIndex = searchIndex;
  els.app.classList.remove("loading");
  els.title.textContent = manifest.title || "Graph Atlas";
  renderPanelState();
  updateStatus();
  renderFilters();
  renderHealth();
  renderNodeList();
  fitGraph();
  if (state.query) {
    els.searchInput.value = state.query;
    await runSearch();
  }
  if (state.selectedId) selectNode(state.selectedId, { hash: false, toggle: false, focus: false });
  draw();
}

function bindEvents() {
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });
  window.addEventListener("hashchange", () => {
    readHash();
    renderAll();
    if (state.selectedId) {
      selectNode(state.selectedId, { hash: false, toggle: false, focus: false });
    } else {
      clearNodeSelection({ hash: false });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      els.reader.classList.remove("open");
    }
  });
  els.toggleLeft.addEventListener("click", () => togglePanel("left"));
  els.toggleReader.addEventListener("click", () => togglePanel("reader"));
  els.toggleNodes.addEventListener("click", () => togglePanel("nodes"));
  els.showLeft.addEventListener("click", () => setPanelCollapsed("left", false));
  els.showReader.addEventListener("click", () => setPanelCollapsed("reader", false));
  els.showNodes.addEventListener("click", () => setPanelCollapsed("nodes", false));
  els.searchInput.addEventListener("input", debounce(async () => {
    state.query = els.searchInput.value.trim();
    writeHash();
    await runSearch();
    renderAll();
  }, 160));
  els.clearFilters.addEventListener("click", () => {
    state.filters.type.clear();
    state.filters.status.clear();
    state.filters.tag.clear();
    writeHash();
    renderAll();
  });
  els.focusDepth.addEventListener("change", () => {
    state.focusDepth = Number(els.focusDepth.value);
    writeHash();
    renderAll();
  });
  els.resetFocus.addEventListener("click", () => {
    state.focusDepth = 0;
    els.focusDepth.value = "0";
    writeHash();
    renderAll();
  });
  els.share.addEventListener("click", async () => {
    writeHash();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      els.status.textContent = "Current view copied";
    } catch {
      els.status.textContent = url;
    }
  });
  els.zoomIn.addEventListener("click", () => zoomAt(BUTTON_ZOOM_IN_FACTOR));
  els.zoomOut.addEventListener("click", () => zoomAt(BUTTON_ZOOM_OUT_FACTOR));
  els.fit.addEventListener("click", fitGraph);
  els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN_FACTOR : WHEEL_ZOOM_OUT_FACTOR;
    const ratio = window.devicePixelRatio || 1;
    zoomAt(factor, event.offsetX * ratio, event.offsetY * ratio);
  }, { passive: false });
  els.canvas.addEventListener("pointerdown", (event) => {
    els.canvas.setPointerCapture(event.pointerId);
    state.dragging = true;
    state.dragStart = { x: event.clientX, y: event.clientY, tx: state.transform.x, ty: state.transform.y };
    els.canvas.classList.add("dragging");
  });
  els.canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging || !state.dragStart) return;
    state.transform.x = state.dragStart.tx + event.clientX - state.dragStart.x;
    state.transform.y = state.dragStart.ty + event.clientY - state.dragStart.y;
    draw();
  });
  els.canvas.addEventListener("pointerup", (event) => {
    const moved = state.dragStart && Math.hypot(event.clientX - state.dragStart.x, event.clientY - state.dragStart.y) > 4;
    state.dragging = false;
    state.dragStart = null;
    els.canvas.classList.remove("dragging");
    if (!moved) {
      const hit = hitNode(event.offsetX, event.offsetY);
      if (hit) selectNode(hit.id, { anchor: graphNodeAnchorSnapshot(hit.id) });
    }
  });
  els.canvas.addEventListener("keydown", (event) => {
    const visible = visibleNodes();
    if (visible.length === 0) return;
    const current = visible.findIndex((node) => node.id === state.selectedId);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectNode(visible[(current + 1 + visible.length) % visible.length].id);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectNode(visible[(current - 1 + visible.length) % visible.length].id);
    }
    if (event.key === "Enter" && state.selectedId) selectNode(state.selectedId);
  });
}

async function runSearch() {
  if (!state.query) {
    els.searchState.textContent = "Type to search titles and content.";
    els.resultList.innerHTML = "";
    return;
  }
  els.searchState.textContent = "Searching";
  let response;
  if (state.apiSearchHealthy) {
    try {
      const api = await fetch(`api/search?q=${encodeURIComponent(state.query)}`);
      if (api.ok && api.headers.get("content-type")?.includes("application/json")) response = await api.json();
    } catch {
      state.apiSearchHealthy = false;
    }
  }
  if (!response) response = { mode: "text", results: searchText(state.query) };
  els.searchMode.textContent = response.mode === "qmd" ? "qmd search" : "text search";
  if (response.fallbackReason) els.searchMode.textContent = "text fallback";
  renderResults(response.results || []);
}

function renderResults(results) {
  if (results.length === 0) {
    els.searchState.textContent = "No matches";
    els.resultList.innerHTML = "";
    return;
  }
  els.searchState.textContent = `${results.length} matches`;
  els.resultList.innerHTML = results.map((result) => `
    <button class="result-button ${result.id === state.selectedId ? "selected" : ""}" data-node="${escapeAttr(result.id)}" type="button" role="option">
      <span class="result-title">${escapeHtml(result.title)}</span>
      <span class="result-path">${escapeHtml(result.path)} · ${result.source}</span>
      <span class="result-snippet">${escapeHtml(result.snippet || "")}</span>
    </button>
  `).join("");
  els.resultList.querySelectorAll("[data-node]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.node));
  });
}

function renderAll() {
  updateStatus();
  renderPanelState();
  renderFilters();
  renderHealth();
  renderNodeList();
  draw();
}

function togglePanel(panel) {
  setPanelCollapsed(panel, !state.panels[panel]);
}

function setPanelCollapsed(panel, collapsed, options = {}) {
  const anchor = options.anchor || null;
  const viewport = anchor ? null : graphViewportSnapshot();
  state.panels[panel] = collapsed;
  renderPanelState();
  requestAnimationFrame(() => {
    resizeCanvas();
    if (anchor) restoreGraphAnchor(anchor);
    else restoreGraphViewport(viewport);
    draw();
  });
}

function renderPanelState() {
  els.app.classList.toggle("left-collapsed", state.panels.left);
  els.app.classList.toggle("reader-collapsed", state.panels.reader);
  els.app.classList.toggle("nodes-collapsed", state.panels.nodes);
  syncPanelControl(els.toggleLeft, state.panels.left, "Collapse controls panel");
  syncPanelControl(els.toggleReader, state.panels.reader, "Collapse reader panel");
  syncPanelControl(els.toggleNodes, state.panels.nodes, "Collapse node list");
  syncPanelControl(els.showLeft, state.panels.left, "controls panel", "Controls", "Show controls panel");
  syncPanelControl(els.showReader, state.panels.reader, "reader panel", "Reader", "Show reader panel");
  syncPanelControl(els.showNodes, state.panels.nodes, "node list", "Nodes", "Show node list");
}

function syncPanelControl(button, collapsed, label, text, title) {
  const accessibleLabel = title || label;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", accessibleLabel);
  button.title = accessibleLabel;
  if (text !== undefined) button.textContent = text;
}

function renderFilters() {
  if (!state.graph) return;
  const nodes = state.graph.nodes;
  const groups = [
    ["type", "Type", countBy(nodes, "type")],
    ["status", "Status", countBy(nodes, "status")],
    ["tag", "Tags", countTags(nodes)]
  ];
  els.filterList.innerHTML = groups.map(([key, label, counts]) => `
    <div class="filter-group">
      <div class="filter-group-title">${label}</div>
      ${Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => `
        <button class="filter-option ${state.filters[key].has(value) ? "active" : ""}" data-filter="${key}" data-value="${escapeAttr(value)}" type="button">
          <span class="filter-marker" aria-hidden="true"></span>
          <span class="filter-label">${escapeHtml(value)}</span>
          <span class="filter-count">${count}</span>
        </button>
      `).join("") || `<div class="search-state">No values</div>`}
    </div>
  `).join("");
  els.filterList.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const set = state.filters[button.dataset.filter];
      const value = button.dataset.value;
      if (set.has(value)) set.delete(value);
      else set.add(value);
      writeHash();
      renderAll();
    });
  });
}

function renderHealth() {
  if (!state.diagnostics) return;
  const d = state.diagnostics;
  const items = [
    ["Broken", d.unresolvedLinks.length, "danger"],
    ["Orphans", d.orphans.length, d.orphans.length ? "warning" : ""],
    ["Draft", d.draftPages.length, d.draftPages.length ? "warning" : ""],
    ["Private", d.privatePages.length, d.privatePages.length ? "danger" : ""]
  ];
  els.healthLegend.innerHTML = items.map(([label, count, tone]) => `
    <div class="health-item ${tone}"><span>${label}</span><strong>${count}</strong></div>
  `).join("") || "No health warnings";
}

function renderNodeList() {
  const nodes = visibleNodes().slice(0, 80);
  els.nodeList.innerHTML = nodes.map((node) => `
    <button class="node-button ${node.id === state.selectedId ? "selected" : ""}" data-node="${escapeAttr(node.id)}" type="button">
      <span class="node-title">${escapeHtml(node.title)}</span>
      <span class="node-path">${escapeHtml(node.id)}</span>
    </button>
  `).join("");
  els.nodeList.querySelectorAll("[data-node]").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.node));
  });
}

async function selectNode(id, options = {}) {
  const settings = { hash: true, toggle: true, focus: true, openReader: true, closeReader: true, anchor: null, ...options };
  if (!state.graph?.nodes.some((node) => node.id === id)) return;
  if (settings.toggle && state.selectedId === id) {
    clearNodeSelection({ hash: settings.hash, closeReader: settings.closeReader, anchor: settings.anchor || graphNodeAnchorSnapshot(id) });
    return;
  }
  state.selectedId = id;
  if (settings.focus) state.focusDepth = 1;
  if (settings.hash) writeHash();
  renderNodeList();
  draw();
  if (settings.openReader) {
    if (state.panels.reader) setPanelCollapsed("reader", false, { anchor: settings.anchor || graphNodeAnchorSnapshot(id) });
    els.reader.classList.add("open");
  }
  const node = state.graph.nodes.find((item) => item.id === id);
  els.readerTitle.textContent = node.title;
  els.readerMeta.innerHTML = metadataChips([node.type, node.status, ...node.tags]);
  els.readerContent.innerHTML = `<p class="empty-copy">Loading content</p>`;
  els.readerLinks.innerHTML = "";
  try {
    const page = await loadJson(`atlas/pages/${encodeURIComponent(id)}.json`);
    if (state.selectedId !== id) return;
    els.readerTitle.textContent = page.title;
    els.readerMeta.innerHTML = metadataChips([page.path, page.metadata.type, page.metadata.status, ...page.metadata.tags]);
    els.readerContent.innerHTML = page.html || `<p class="empty-copy">No rendered content.</p>`;
    els.readerContent.querySelectorAll("a[data-node-id]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        selectNode(link.dataset.nodeId);
      });
    });
    els.readerLinks.innerHTML = `
      ${readerLinkGroup("Links", page.wikilinks)}
      ${readerLinkGroup("Backlinks", page.backlinks)}
    `;
    els.readerLinks.querySelectorAll("[data-node]").forEach((button) => {
      button.addEventListener("click", () => selectNode(button.dataset.node));
    });
  } catch (error) {
    els.readerContent.innerHTML = `<p class="empty-copy">Missing content for ${escapeHtml(id)}. ${escapeHtml(error.message)}</p>`;
  }
  updateStatus();
}

function clearNodeSelection(options = {}) {
  const settings = { hash: true, closeReader: true, anchor: null, ...options };
  state.selectedId = null;
  state.focusDepth = 0;
  if (settings.hash) writeHash();
  renderNodeList();
  draw();
  resetReader();
  if (settings.closeReader) {
    els.reader.classList.remove("open");
    if (!state.panels.reader) setPanelCollapsed("reader", true, { anchor: settings.anchor });
  }
  updateStatus();
}

function resetReader() {
  els.readerTitle.textContent = "Select a node";
  els.readerMeta.innerHTML = "";
  els.readerContent.innerHTML = `<p class="empty-copy">Select a graph node or search result.</p>`;
  els.readerLinks.innerHTML = "";
}

function draw() {
  if (!state.graph) return;
  resizeCanvas();
  const { width, height } = els.canvas;
  ctx.clearRect(0, 0, width, height);
  const nodes = visibleNodes();
  const visible = new Set(nodes.map((node) => node.id));
  if (state.graph.nodes.length === 0) {
    setGraphMessage("No graph nodes yet. See atlas/audit.md for export details.");
    return;
  }
  if (nodes.length === 0) {
    setGraphMessage("No nodes match the active filters.");
    return;
  }
  setGraphMessage("");
  const selectedNeighbors = neighbors(state.selectedId, 1);
  const screenNodes = nodes.map((node) => ({ node, p: toScreen(state.graph.layout[node.id]) }));
  const viewportStats = graphViewportStats(screenNodes, width, height);
  const labelPolicy = graphLabelPolicy(viewportStats);
  const centeredLabelIds = graphLabelIds(screenNodes, width, height, labelPolicy);
  let renderedLabelCount = 0;
  ctx.lineWidth = 1;
  for (const edge of state.graph.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    const a = toScreen(state.graph.layout[edge.source]);
    const b = toScreen(state.graph.layout[edge.target]);
    const active = state.selectedId && (edge.source === state.selectedId || edge.target === state.selectedId);
    ctx.strokeStyle = active ? cssVar("--graph-edge-active") : cssVar("--graph-edge");
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const { node, p } of screenNodes) {
    const selected = node.id === state.selectedId;
    const neighbor = selectedNeighbors.has(node.id);
    const radius = nodeRadius(selected, neighbor);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(node.type);
    ctx.fill();
    ctx.lineWidth = nodeStrokeWidth(selected, healthNode(node.id));
    ctx.strokeStyle = selected ? cssVar("--accent-strong") : healthNode(node.id) ? cssVar("--danger") : "rgba(238, 243, 231, 0.92)";
    ctx.stroke();
    if (shouldDrawNodeLabel(node.id, selected, centeredLabelIds)) {
      renderedLabelCount += 1;
      const labelSize = nodeLabelSize(selected, neighbor, labelPolicy);
      const labelOffset = Math.round(radius + 4 * graphLabelScale());
      ctx.font = `${labelSize}px "IBM Plex Sans", sans-serif`;
      ctx.fillStyle = cssVar("--graph-label");
      ctx.strokeStyle = "rgba(21, 26, 23, 0.82)";
      ctx.lineWidth = Math.max(3, Math.round(labelSize * 0.22));
      ctx.strokeText(node.title, p.x + labelOffset, p.y + Math.round(labelSize * 0.35));
      ctx.fillText(node.title, p.x + labelOffset, p.y + Math.round(labelSize * 0.35));
    }
  }
  els.canvas.setAttribute("aria-label", graphAria(nodes, viewportStats, renderedLabelCount));
}

function fitGraph() {
  if (!state.graph) return;
  resizeCanvas();
  const nodes = visibleNodes();
  if (nodes.length === 0) return;
  const points = nodes.map((node) => state.graph.layout[node.id]);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);
  const scale = Math.min(1.7, Math.max(0.35, Math.min((els.canvas.width - 120) / graphWidth, (els.canvas.height - 120) / graphHeight)));
  state.transform.scale = scale;
  state.transform.x = els.canvas.width / 2 - ((minX + maxX) / 2) * scale;
  state.transform.y = els.canvas.height / 2 - ((minY + maxY) / 2) * scale;
  draw();
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

function graphViewportSnapshot() {
  resizeCanvas();
  const scale = state.transform.scale;
  return {
    scale,
    centerGraphX: (els.canvas.width / 2 - state.transform.x) / scale,
    centerGraphY: (els.canvas.height / 2 - state.transform.y) / scale
  };
}

function graphNodeAnchorSnapshot(nodeId) {
  if (!state.graph?.layout[nodeId]) return null;
  resizeCanvas();
  const point = toScreen(state.graph.layout[nodeId]);
  return {
    nodeId,
    screenX: point.x,
    screenY: point.y,
    scale: state.transform.scale
  };
}

function restoreGraphViewport(viewport) {
  if (!viewport) return;
  state.transform.scale = viewport.scale;
  state.transform.x = els.canvas.width / 2 - viewport.centerGraphX * viewport.scale;
  state.transform.y = els.canvas.height / 2 - viewport.centerGraphY * viewport.scale;
}

function restoreGraphAnchor(anchor) {
  if (!anchor || !state.graph?.layout[anchor.nodeId]) return;
  const point = state.graph.layout[anchor.nodeId];
  state.transform.scale = anchor.scale;
  state.transform.x = anchor.screenX - point.x * anchor.scale;
  state.transform.y = anchor.screenY - point.y * anchor.scale;
}

function visibleNodes() {
  if (!state.graph) return [];
  let nodes = state.graph.nodes.filter((node) => {
    if (state.filters.type.size && !state.filters.type.has(node.type)) return false;
    if (state.filters.status.size && !state.filters.status.has(node.status)) return false;
    if (state.filters.tag.size && !node.tags.some((tag) => state.filters.tag.has(tag))) return false;
    if (state.query) {
      const doc = state.searchIndex.find((item) => item.id === node.id);
      if (!doc || !`${doc.title} ${doc.path} ${doc.tags.join(" ")} ${doc.text}`.toLowerCase().includes(state.query.toLowerCase())) return false;
    }
    return true;
  });
  if (state.focusDepth > 0 && state.selectedId) {
    const focused = neighbors(state.selectedId, state.focusDepth);
    focused.add(state.selectedId);
    nodes = nodes.filter((node) => focused.has(node.id));
  }
  return nodes;
}

function neighbors(id, depth) {
  const found = new Set();
  if (!id || !state.graph) return found;
  let frontier = new Set([id]);
  for (let i = 0; i < depth; i += 1) {
    const next = new Set();
    for (const edge of state.graph.edges) {
      if (frontier.has(edge.source) && !found.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !found.has(edge.source)) next.add(edge.source);
    }
    next.forEach((item) => found.add(item));
    frontier = next;
  }
  return found;
}

function hitNode(x, y) {
  return visibleNodes().find((node) => {
    const p = toScreen(state.graph.layout[node.id]);
    return Math.hypot(p.x - x * (window.devicePixelRatio || 1), p.y - y * (window.devicePixelRatio || 1)) < 12;
  });
}

function toScreen(point) {
  return {
    x: point.x * state.transform.scale + state.transform.x,
    y: point.y * state.transform.scale + state.transform.y
  };
}

function zoomAt(factor, x = els.canvas.width / 2, y = els.canvas.height / 2) {
  const old = state.transform.scale;
  const next = Math.max(MIN_GRAPH_ZOOM_SCALE, Math.min(MAX_GRAPH_ZOOM_SCALE, old * factor));
  state.transform.x = x - (x - state.transform.x) * (next / old);
  state.transform.y = y - (y - state.transform.y) * (next / old);
  state.transform.scale = next;
  draw();
}

function graphNodeScale() {
  return Math.min(2.8, Math.max(1, Math.sqrt(state.transform.scale)));
}

function graphLabelScale() {
  return Math.min(2.4, Math.max(1, Math.sqrt(state.transform.scale)));
}

function nodeRadius(selected, neighbor) {
  const baseRadius = selected ? 8 : neighbor ? 6 : 5;
  return Math.round(baseRadius * graphNodeScale());
}

function nodeStrokeWidth(selected, unhealthy) {
  const baseWidth = selected ? 3 : unhealthy ? 2 : 1;
  return Math.max(baseWidth, Math.round(baseWidth * graphNodeScale() * 0.75));
}

function nodeLabelSize(selected, neighbor, labelPolicy = { labelScale: 1 }) {
  const baseSize = selected ? 13 : 11;
  const densityScale = selected ? 1 : neighbor ? Math.max(0.9, labelPolicy.labelScale) : labelPolicy.labelScale;
  return Math.round(baseSize * graphLabelScale() * densityScale);
}

function graphViewportStats(screenNodes, width, height) {
  const margin = 80;
  const viewportNodes = screenNodes.filter(({ p }) => isPointNearViewport(p, width, height, margin));
  const viewportArea = Math.max(1, width * height);
  return {
    nodeCount: viewportNodes.length,
    nodeDensity: viewportNodes.length / (viewportArea / 1000000),
    viewportArea
  };
}

function graphLabelPolicy(viewportStats) {
  const count = viewportStats.nodeCount;
  if (count <= 60) return { maxAmbientLabels: count, labelScale: 1, cellSize: 90, showAllAmbientLabels: true };
  if (count <= 140) return { maxAmbientLabels: 48, labelScale: 0.92, cellSize: 140 };
  if (count <= 320) return { maxAmbientLabels: 24, labelScale: 0.78, cellSize: 190 };
  return { maxAmbientLabels: 10, labelScale: 0.68, cellSize: 260 };
}

function graphLabelIds(screenNodes, width, height, labelPolicy) {
  const labelIds = new Set();
  if (state.transform.scale <= 0.85 || labelPolicy.maxAmbientLabels === 0) return labelIds;
  const viewportCenter = { x: width / 2, y: height / 2 };
  const candidates = screenNodes
    .filter(({ node, p }) => node.id !== state.selectedId && isPointNearViewport(p, width, height, 120))
    .map(({ node, p }) => ({
      node,
      p,
      centerDistance: Math.hypot(p.x - viewportCenter.x, p.y - viewportCenter.y)
    }))
    .sort((a, b) => a.centerDistance - b.centerDistance || a.node.title.localeCompare(b.node.title));

  if (labelPolicy.showAllAmbientLabels) {
    candidates.forEach(({ node }) => labelIds.add(node.id));
    return labelIds;
  }

  const claimedLabelCells = new Set();
  for (const candidate of candidates) {
    if (labelIds.size >= labelPolicy.maxAmbientLabels) break;
    const cellKey = `${Math.floor(candidate.p.x / labelPolicy.cellSize)}:${Math.floor(candidate.p.y / labelPolicy.cellSize)}`;
    if (claimedLabelCells.has(cellKey)) continue;
    claimedLabelCells.add(cellKey);
    labelIds.add(candidate.node.id);
  }
  return labelIds;
}

function shouldDrawNodeLabel(nodeId, selected, centeredLabelIds) {
  return selected || centeredLabelIds.has(nodeId);
}

function isPointNearViewport(point, width, height, margin) {
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

function updateStatus() {
  if (!state.manifest || !state.graph) return;
  const warning = state.manifest.stats.warnings ? ` · ${state.manifest.stats.warnings} warnings` : "";
  const selected = state.selectedId ? ` · ${state.selectedId}` : "";
  els.status.textContent = `${state.graph.nodes.length} nodes · ${state.graph.edges.length} edges${warning}${selected}`;
  els.focusDepth.value = String(state.focusDepth);
}

function setGraphMessage(message) {
  els.message.textContent = message;
  els.message.classList.toggle("hidden", !message);
}

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  state.selectedId = params.get("node") || null;
  state.query = params.get("q") || "";
  state.focusDepth = Number(params.get("focus") || 0);
  for (const key of ["type", "status", "tag"]) {
    state.filters[key].clear();
    for (const value of (params.get(key) || "").split(",").filter(Boolean)) state.filters[key].add(value);
  }
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.selectedId) params.set("node", state.selectedId);
  if (state.query) params.set("q", state.query);
  if (state.focusDepth) params.set("focus", String(state.focusDepth));
  for (const key of ["type", "status", "tag"]) {
    if (state.filters[key].size) params.set(key, [...state.filters[key]].join(","));
  }
  history.replaceState(null, "", `#${params.toString()}`);
}

function searchText(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return state.searchIndex.map((doc) => {
    const haystack = `${doc.title} ${doc.path} ${doc.tags.join(" ")} ${doc.text}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0) + (doc.title.toLowerCase().includes(term) ? 4 : 0), 0);
    return { id: doc.id, title: doc.title, path: doc.path, score, snippet: doc.text.slice(0, 180), source: "text" };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
}

function metadataChips(values) {
  return values.filter(Boolean).map((value) => `<span class="metadata-chip">${escapeHtml(value)}</span>`).join("");
}

function readerLinkGroup(label, ids) {
  const content = ids.length
    ? ids.map(linkButton).join("")
    : `<span class="reader-link-empty">none</span>`;
  return `
    <section class="reader-link-group" aria-label="${escapeAttr(label)}">
      <div class="reader-link-label">${escapeHtml(label)}</div>
      <div class="reader-link-list">${content}</div>
    </section>
  `;
}

function linkButton(id) {
  const node = state.graph.nodes.find((item) => item.id === id);
  return `<button class="text-button reader-link-button" type="button" data-node="${escapeAttr(id)}">${escapeHtml(node?.title || id)}</button>`;
}

function countBy(nodes, key) {
  return nodes.reduce((acc, node) => {
    acc[node[key] || "unknown"] = (acc[node[key] || "unknown"] || 0) + 1;
    return acc;
  }, {});
}

function countTags(nodes) {
  return nodes.reduce((acc, node) => {
    for (const tag of node.tags) acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});
}

function colorFor(value) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function healthNode(id) {
  if (!state.diagnostics) return false;
  return state.diagnostics.orphans.includes(id) || state.diagnostics.draftPages.includes(id) || state.diagnostics.privatePages.includes(id);
}

function graphAria(nodes, viewportStats = { nodeCount: nodes.length }, renderedLabelCount = 0) {
  const selected = state.selectedId ? `Selected node ${state.selectedId}.` : "No selected node.";
  const focus = state.focusDepth ? `Focus depth ${state.focusDepth}.` : "Focus mode off.";
  return `Graph canvas with ${nodes.length} visible nodes, ${viewportStats.nodeCount} nodes in the current window, ${renderedLabelCount} node titles shown, and ${state.graph.edges.length} total edges. ${selected} ${focus}`;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
