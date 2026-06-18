import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("web viewer control layout", () => {
  it("keeps filter marker, label, and count in stable columns", async () => {
    const css = await readFile(path.resolve("src/web-viewer/assets/app.css"), "utf8");
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain('class="filter-marker"');
    expect(js).toContain('class="filter-label"');
    expect(js).toContain('class="filter-count"');
    expect(css).toContain("grid-template-columns: 16px minmax(0, 1fr) auto;");
    expect(css).not.toContain(".filter-option.active::before");
  });

  it("stacks focus depth and reset controls with explicit spacing", async () => {
    const css = await readFile(path.resolve("src/web-viewer/assets/app.css"), "utf8");

    expect(css).toContain(".depth-control {\n  display: grid;");
    expect(css).toContain("margin-bottom: 10px;");
  });

  it("wraps reader links with gaps inside a capped scroll area", async () => {
    const css = await readFile(path.resolve("src/web-viewer/assets/app.css"), "utf8");
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("readerLinkGroup(\"Links\", page.wikilinks)");
    expect(js).toContain("reader-link-list");
    expect(js).toContain("reader-link-button");
    expect(css).toContain("max-height: min(34dvh, 260px);");
    expect(css).toContain(".reader-link-list {\n  display: flex;");
    expect(css).toContain("flex-wrap: wrap;");
    expect(css).toContain("gap: 8px;");
  });

  it("keeps collapsible panel controls local to their panels", async () => {
    const html = await readFile(path.resolve("src/web-viewer/index.html"), "utf8");
    const css = await readFile(path.resolve("src/web-viewer/assets/app.css"), "utf8");
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(html).toContain('class="panel-titlebar utility-titlebar"');
    expect(html).toContain('class="panel-titlebar node-titlebar"');
    expect(html).toContain('id="toggle-left"');
    expect(html).toContain('id="show-left"');
    expect(html).toContain('id="show-reader"');
    expect(html).toContain('id="show-nodes"');
    expect(html).not.toContain('title="Toggle controls panel"');
    expect(html).not.toContain(">Hide</button>");
    const stripActions = html.slice(html.indexOf('<div class="strip-actions">'), html.indexOf("</div>", html.indexOf('<div class="strip-actions">')));
    expect(stripActions).not.toContain('id="toggle-left"');
    expect(stripActions).not.toContain('id="toggle-reader"');
    expect(stripActions).not.toContain('id="toggle-nodes"');
    expect(js).toContain("function togglePanel(panel)");
    expect(js).toContain("function syncPanelControl(button, collapsed, label, text, title)");
    expect(js).toContain('classList.toggle("left-collapsed"');
    expect(js).toContain('classList.toggle("reader-collapsed"');
    expect(js).toContain('classList.toggle("nodes-collapsed"');
    expect(css).toContain(".app-shell.left-collapsed");
    expect(css).toContain(".panel-edge-toggle");
    expect(css).toContain(".panel-collapse-button::before");
    expect(css).toContain("grid-template-rows: 48px minmax(0, 1fr);");
    expect(css).toContain(".top-strip .icon-button");
    expect(css).toContain("min-height: 32px;");
    expect(css).toContain("width: 34px;");
    expect(css).toContain("mask: var(--collapse-icon) center / contain no-repeat;");
    expect(css).toContain(".left-collapsed .edge-left-toggle");
    expect(css).toContain(".edge-left-toggle {\n  top: 64px;");
    expect(css).not.toContain("writing-mode: vertical-rl;");
    expect(css).not.toContain("transform: rotate(135deg);");
    expect(css).toContain(".reader-collapsed .reader-panel");
    expect(css).toContain(".nodes-collapsed .node-list-panel");
  });

  it("preserves graph zoom when panels collapse or expand", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");
    const setPanelCollapsedBody = js.match(/function setPanelCollapsed\(panel, collapsed, options = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";

    expect(js).toContain("function graphViewportSnapshot()");
    expect(js).toContain("function restoreGraphViewport(viewport)");
    expect(js).toContain("const viewport = anchor ? null : graphViewportSnapshot();");
    expect(js).toContain("restoreGraphViewport(viewport);");
    expect(js).toContain("state.transform.scale = viewport.scale;");
    expect(setPanelCollapsedBody).not.toContain("fitGraph();");
  });

  it("keeps the clicked node anchored when selection opens one-hop focus", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("selectNode(hit.id, { anchor: graphNodeAnchorSnapshot(hit.id) });");
    expect(js).toContain("clearNodeSelection({ hash: settings.hash, closeReader: settings.closeReader, anchor: settings.anchor || graphNodeAnchorSnapshot(id) });");
    expect(js).toContain("function graphNodeAnchorSnapshot(nodeId)");
    expect(js).toContain("screenX: point.x");
    expect(js).toContain("screenY: point.y");
    expect(js).toContain("function restoreGraphAnchor(anchor)");
    expect(js).toContain("if (anchor) restoreGraphAnchor(anchor);");
    expect(js).toContain('setPanelCollapsed("reader", false, { anchor: settings.anchor || graphNodeAnchorSnapshot(id) });');
    expect(js).toContain("state.transform.x = anchor.screenX - point.x * anchor.scale;");
    expect(js).toContain("state.transform.y = anchor.screenY - point.y * anchor.scale;");
  });

  it("toggles node selection with 1-hop focus and reader state", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("const settings = { hash: true, toggle: true, focus: true, openReader: true, closeReader: true, anchor: null, ...options };");
    expect(js).toContain("if (settings.toggle && state.selectedId === id)");
    expect(js).toContain("clearNodeSelection({ hash: settings.hash, closeReader: settings.closeReader, anchor: settings.anchor || graphNodeAnchorSnapshot(id) });");
    expect(js).toContain("if (settings.focus) state.focusDepth = 1;");
    expect(js).toContain('setPanelCollapsed("reader", false, { anchor: settings.anchor || graphNodeAnchorSnapshot(id) });');
    expect(js).toContain("function clearNodeSelection(options = {})");
    expect(js).toContain("const settings = { hash: true, closeReader: true, anchor: null, ...options };");
    expect(js).toContain("state.selectedId = null;");
    expect(js).toContain("state.focusDepth = 0;");
    expect(js).toContain('setPanelCollapsed("reader", true, { anchor: settings.anchor });');
    expect(js).toContain("function resetReader()");
    expect(js).toContain('state.selectedId = params.get("node") || null;');
    expect(js).toContain("selectNode(state.selectedId, { hash: false, toggle: false, focus: false });");
  });

  it("allows dense graph canvases to zoom in beyond the default inspection scale", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("const MAX_GRAPH_ZOOM_SCALE = 48;");
    expect(js).toContain("const BUTTON_ZOOM_IN_FACTOR = 1.32;");
    expect(js).toContain("Math.min(MAX_GRAPH_ZOOM_SCALE, old * factor)");
    expect(js).not.toContain("Math.min(4, old * factor)");
  });

  it("scales node circles and labels as graph zoom increases", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("function graphNodeScale()");
    expect(js).toContain("function graphLabelScale()");
    expect(js).toContain("function nodeRadius(selected, neighbor)");
    expect(js).toContain("function nodeLabelSize(selected, neighbor, labelPolicy");
    expect(js).toContain("const radius = nodeRadius(selected, neighbor);");
    expect(js).toContain("const labelSize = nodeLabelSize(selected, neighbor, labelPolicy);");
    expect(js).not.toContain("const radius = selected ? 8 : neighbor ? 6 : 5;");
    expect(js).not.toContain('ctx.font = `${selected ? 13 : 11}px "IBM Plex Sans", sans-serif`;');
  });

  it("uses viewport density to decide how many node titles to draw", async () => {
    const js = await readFile(path.resolve("src/web-viewer/assets/app.js"), "utf8");

    expect(js).toContain("function graphViewportStats(screenNodes, width, height)");
    expect(js).toContain("nodeCount: viewportNodes.length");
    expect(js).toContain("function graphLabelPolicy(viewportStats)");
    expect(js).toContain("return { maxAmbientLabels: 10, labelScale: 0.68, cellSize: 260 };");
    expect(js).toContain("function graphLabelIds(screenNodes, width, height, labelPolicy)");
    expect(js).toContain("centerDistance: Math.hypot(p.x - viewportCenter.x, p.y - viewportCenter.y)");
    expect(js).toContain(".sort((a, b) => a.centerDistance - b.centerDistance");
    expect(js).toContain("function shouldDrawNodeLabel(nodeId, selected, centeredLabelIds)");
    expect(js).toContain("const labelPolicy = graphLabelPolicy(viewportStats);");
    expect(js).toContain("const centeredLabelIds = graphLabelIds(screenNodes, width, height, labelPolicy);");
    expect(js).toContain("let renderedLabelCount = 0;");
    expect(js).toContain("renderedLabelCount += 1;");
    expect(js).toContain("node titles shown");
    expect(js).not.toContain("maxAmbientLabels: 0");
    expect(js).not.toContain("claimedLabelCells.size >= labelPolicy.maxAmbientLabels");
    expect(js).not.toContain("if (state.transform.scale > 0.85 || selected || neighbor)");
  });
});
