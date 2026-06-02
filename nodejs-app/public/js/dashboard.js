/**
 * DataGraphX Dashboard - 6视图仪表板逻辑
 * 替代 Python Streamlit 的 session state 和 render 函数
 */
(function() {
  'use strict';

  // Global app state
  window.appState = {
    apiConfigured: false,
    neo4jConnected: false,
    fileProcessed: false,
    analysisResult: null,
    llmProvider: 'deepseek',
    modelName: 'deepseek-chat',
  };

  // --- Tab navigation ---
  document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    initTabs();
    initSubTabs();
    initQA();
  });

  function initSidebar() {
    const providerSelect = document.getElementById('api-provider');
    const modelNameInput = document.getElementById('model-name');
    const apiKeyLabel = document.getElementById('api-key-label');

    providerSelect.addEventListener('change', () => {
      const p = providerSelect.value;
      apiKeyLabel.textContent = p === 'deepseek' ? 'DeepSeek API 密钥' : 'OpenAI API 密钥';
      modelNameInput.value = p === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini';
    });

    // Test LLM connection
    document.getElementById('test-llm-btn').addEventListener('click', async () => {
      const provider = providerSelect.value;
      const apiKey = document.getElementById('api-key').value;
      const model = document.getElementById('model-name').value;
      try {
        const resp = await fetch('/api/test-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey, model }),
        });
        const data = await resp.json();
        showStatus(data.success ? 'success' : 'error', data.message, 'api-setup');
      } catch (e) {
        showStatus('error', e.message, 'api-setup');
      }
    });

    // Test embeddings
    document.getElementById('test-embed-btn').addEventListener('click', async () => {
      const type = document.getElementById('embed-type').value;
      const baseURL = document.getElementById('embed-url')?.value;
      const model = document.getElementById('embed-model')?.value;
      const apiKey = document.getElementById('api-key').value;
      try {
        const resp = await fetch('/api/test-embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, apiKey, baseURL, model }),
        });
        const data = await resp.json();
        showStatus(data.success ? 'success' : 'error', data.message, 'api-setup');
      } catch (e) {
        showStatus('error', e.message, 'api-setup');
      }
    });

    // Confirm setup
    document.getElementById('confirm-setup-btn').addEventListener('click', () => {
      window.appState.apiConfigured = true;
      window.appState.llmProvider = providerSelect.value;
      window.appState.modelName = modelNameInput.value;
      document.getElementById('neo4j-setup').style.display = 'block';
      showStatus('success', 'API 设置完成', 'api-setup');
    });

    // Connect Neo4j
    document.getElementById('connect-neo4j-btn').addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/neo4j/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: document.getElementById('neo4j-url').value,
            username: document.getElementById('neo4j-user').value,
            password: document.getElementById('neo4j-password').value,
          }),
        });
        const data = await resp.json();
        if (data.success) {
          window.appState.neo4jConnected = true;
          document.getElementById('upload-section').style.display = 'block';
          showStatus('success', '已成功连接到 Neo4j 数据库', 'neo4j-setup');
        } else {
          showStatus('error', data.message, 'neo4j-setup');
        }
      } catch (e) {
        showStatus('error', e.message, 'neo4j-setup');
      }
    });

    // Upload file
    document.getElementById('upload-btn').addEventListener('click', async () => {
      const fileInput = document.getElementById('file-input');
      const file = fileInput.files[0];
      if (!file) {
        showStatus('error', '请选择文件', 'upload-section');
        return;
      }

      const progressBar = document.getElementById('upload-progress');
      const statusEl = document.getElementById('upload-status');
      progressBar.style.display = 'block';
      statusEl.textContent = '正在处理文档...';

      const formData = new FormData();
      formData.append('file', file);
      formData.append('llmProvider', window.appState.llmProvider);

      try {
        const resp = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await resp.json();

        if (data.success) {
          window.appState.fileProcessed = true;
          window.appState.analysisResult = data.analysisResult;
          document.getElementById('doc-info').style.display = 'block';
          document.getElementById('dashboard').style.display = 'block';
          document.getElementById('main-placeholder').style.display = 'none';

          // Update doc meta
          const meta = data.analysisResult.stats?.meta || {};
          document.getElementById('doc-meta').innerHTML = `
            <p>文件名: ${meta.title || 'N/A'}</p>
            <p>文本块: ${meta.totalChunks || 0}</p>
            <p>实体数: ${meta.totalEntities || 0}</p>
            <p>关系数: ${meta.totalRelations || 0}</p>
          `;

          renderAllViews(data.analysisResult);
          showStatus('success', `${file.name} 处理完成`, 'upload-section');
        } else {
          showStatus('error', data.error || '处理失败', 'upload-section');
        }
      } catch (e) {
        showStatus('error', e.message, 'upload-section');
      } finally {
        progressBar.style.display = 'none';
      }
    });

    // Reanalyze
    document.getElementById('reanalyze-btn').addEventListener('click', async () => {
      try {
        await fetch('/api/reset', { method: 'POST' });
        window.appState = {
          apiConfigured: true,
          neo4jConnected: true,
          fileProcessed: false,
          analysisResult: null,
          llmProvider: providerSelect.value,
          modelName: modelNameInput.value,
        };
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('main-placeholder').style.display = 'block';
        document.getElementById('doc-info').style.display = 'none';
      } catch (e) { /* ignore */ }
    });
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const targetId = 'tab-' + tab.dataset.tab;
        const target = document.getElementById(targetId);
        if (target) target.style.display = 'block';
      });
    });
  }

  function initSubTabs() {
    document.querySelectorAll('.sub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const parent = tab.closest('.tab-content');
        parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const vizType = tab.dataset.viz;
        ['standard', 'force', 'fisheye', '3d'].forEach(v => {
          const el = parent.querySelector('#kg-' + v);
          if (el) el.style.display = v === vizType ? 'block' : 'none';
        });

        // Render the selected viz
        const result = window.appState.analysisResult;
        if (!result) return;

        const graphData = result.graphData || {};
        const nodes = graphData.nodes || [];
        const links = graphData.links || [];

        const nodeTypes = {};
        nodes.forEach(n => { nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1; });

        if (vizType === 'force' && nodes.length) {
          renderForceGraph(document.getElementById('kg-force'), nodes, links, nodeTypes);
        } else if (vizType === 'fisheye' && nodes.length) {
          renderFisheyeGraph(document.getElementById('kg-fisheye'), nodes, links, nodeTypes);
        } else if (vizType === '3d' && nodes.length) {
          render3DGraph(document.getElementById('kg-3d'), nodes, links, nodeTypes);
        }
      });
    });
  }

  // --- Render All Views ---
  function renderAllViews(result) {
    renderOverview(result);
    renderTimeline(result);
    renderKnowledgeGraph(result);
    renderSpatial(result);
    renderSourceAnalysis(result);

    const initSubTab = document.querySelector('#tab-knowledge-graph .sub-tab.active');
    if (initSubTab) initSubTab.click();
  }

  // === View 1: Overview ===
  function renderOverview(result) {
    const stats = result.stats || {};
    const meta = stats.meta || {};
    const entityData = result.entityData || {};
    const spatialData = result.spatialData || {};
    const personData = result.personData || {};
    const keywordData = result.keywordData || {};

    // KPIs
    document.getElementById('kpi-chunks').textContent = meta.totalChunks || 0;
    document.getElementById('kpi-entities').textContent = meta.totalEntities || 0;
    document.getElementById('kpi-relations').textContent = meta.totalRelations || 0;
    document.getElementById('kpi-persons').textContent = personData.totalPersons || 0;
    document.getElementById('kpi-locations').textContent = spatialData.totalLocations || 0;
    document.getElementById('kpi-chars').textContent = (stats.totalChars || 0).toLocaleString();

    // Entity pie chart
    const entityDist = stats.entityDistribution || {};
    if (Object.keys(entityDist).length) {
      Plotly.newPlot('chart-entity-pie', [{
        type: 'pie',
        values: Object.values(entityDist),
        labels: Object.keys(entityDist),
        hole: 0.3,
        textposition: 'inside',
        textinfo: 'percent+label',
      }], { height: 350, margin: { l: 10, r: 10, t: 40, b: 10 } });
    }

    // Rel bar chart
    const relDist = stats.relationDistribution || {};
    if (Object.keys(relDist).length) {
      Plotly.newPlot('chart-rel-bar', [{
        type: 'bar',
        x: Object.keys(relDist),
        y: Object.values(relDist),
      }], { height: 350, margin: { l: 10, r: 10, t: 40, b: 10 }, xaxis: { title: '关系类型' }, yaxis: { title: '数量' } });
    }

    // DocuBurst sunburst
    const allNodes = entityData.allNodes || [];
    if (allNodes.length) {
      const sunburstData = [{ id: 'root', labels: '全部文档', parent: '', value: allNodes.length }];
      const typeCounts = {};
      const typeSet = new Set();
      allNodes.forEach(n => {
        const nt = n.type || 'Unknown';
        const typeId = 'type_' + nt;
        typeSet.add(typeId);
        typeCounts[typeId] = (typeCounts[typeId] || 0) + 1;
        const eid = 'entity_' + (n.id || '') + '_' + nt;
        sunburstData.push({ id: typeId, labels: nt, parent: 'root', value: 0 });
        sunburstData.push({ id: eid, labels: ((n.text || n.id || '').slice(0, 20)), parent: typeId, value: 1 });
      });
      sunburstData.forEach(d => { if (typeSet.has(d.id)) d.value = typeCounts[d.id] || 0; });

      Plotly.newPlot('chart-docuburst', [{
        type: 'sunburst',
        ids: sunburstData.map(d => d.id),
        labels: sunburstData.map(d => d.labels),
        parents: sunburstData.map(d => d.parent),
        values: sunburstData.map(d => d.value),
        branchvalues: 'total',
        textinfo: 'label+percent parent',
        maxdepth: 3,
      }], { height: 600, margin: { l: 10, r: 10, t: 50, b: 10 } });
    }

    // Keywords bar
    const keywords = keywordData.keywords || [];
    if (keywords.length) {
      const topK = keywords.slice(0, 15);
      Plotly.newPlot('chart-keywords', [{
        type: 'bar',
        x: topK.map(k => k.score),
        y: topK.map(k => k.term),
        orientation: 'h',
      }], { height: 380, yaxis: { categoryorder: 'total ascending' }, xaxis: { title: '权重' } });
    }

    // Category pie
    const catDist = keywordData.categoryDistribution || {};
    if (Object.keys(catDist).length) {
      Plotly.newPlot('chart-categories', [{
        type: 'pie',
        values: Object.values(catDist),
        labels: Object.keys(catDist),
        hole: 0.35,
        textposition: 'inside',
        textinfo: 'percent+label',
      }], { height: 380 });
    }

    // Persons table
    const personList = personData.personList || [];
    const tbody = document.querySelector('#person-table tbody');
    tbody.innerHTML = personList.slice(0, 15).map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.count}</td><td>${p.title || '-'}</td><td>${(p.context || '').slice(0, 80)}</td></tr>`
    ).join('');

    // Insights
    document.getElementById('insights-list').innerHTML = (result.insights || []).map(i => `<li>${i}</li>`).join('');

    // Pipeline KPIs
    document.getElementById('pipe-chunks').textContent = meta.totalChunks || 0;
    document.getElementById('pipe-keywords').textContent = keywords.length;
    document.getElementById('pipe-persons').textContent = personData.totalPersons || 0;
    document.getElementById('pipe-graph').textContent = `${meta.totalEntities || 0}实体/${meta.totalRelations || 0}关系`;
    document.getElementById('pipe-timeline').textContent = `${meta.timelineEvents || 0}事件/${(result.timeline || []).length}节点`;
    document.getElementById('pipe-spatial').textContent = spatialData.totalLocations || 0;
  }

  // === View 2: Timeline ===
  function renderTimeline(result) {
    const timeline = result.timeline || [];
    if (!timeline.length) return;

    document.getElementById('tl-nodes').textContent = timeline.length;
    document.getElementById('tl-events').textContent = timeline.reduce((s, d) => s + (d.count || 0), 0);
    const allCats = new Set();
    timeline.forEach(d => (d.categories || []).forEach(c => allCats.add(c)));
    document.getElementById('tl-categories').textContent = allCats.size;

    // Category filter
    const filter = document.getElementById('timeline-category-filter');
    filter.innerHTML = '<option value="全部">全部</option>' +
      [...allCats].map(c => `<option value="${c}">${c}</option>`).join('');

    // Scatter plot
    const scatterData = [];
    timeline.forEach(day => {
      (day.events || []).forEach(evt => {
        scatterData.push({ date: day.date, category: evt.category || '其他', summary: evt.summary });
      });
    });

    const df = {};
    scatterData.forEach(d => {
      const key = d.date + '|' + d.category;
      df[key] = (df[key] || 0) + 1;
    });

    const xVals = [], yVals = [], sVals = [], cVals = [];
    Object.entries(df).forEach(([key, count]) => {
      const [date, cat] = key.split('|');
      xVals.push(date);
      yVals.push(cat);
      sVals.push(count);
      cVals.push(cat);
    });

    Plotly.newPlot('chart-timeline-scatter', [{
      type: 'scatter',
      mode: 'markers',
      x: xVals,
      y: yVals,
      marker: { size: sVals.map(s => Math.max(5, s * 10)), sizemode: 'diameter' },
      text: sVals.map((s, i) => `${yVals[i]}: ${s} events`),
      hoverinfo: 'text',
    }], { height: 400, margin: { l: 10, r: 10, t: 40, b: 10 }, xaxis: { tickangle: -45 } });

    filter.onchange = () => renderTimelineEvents(timeline, filter.value);
    renderTimelineEvents(timeline, '全部');
  }

  function renderTimelineEvents(timeline, selectedCat) {
    const container = document.getElementById('timeline-events-list');
    let html = '';
    const isSparse = timeline.length <= 3;

    [...timeline].reverse().forEach(day => {
      let events = day.events || [];
      if (selectedCat !== '全部') events = events.filter(e => e.category === selectedCat);
      if (!events.length) return;

      html += `<details ${isSparse ? 'open' : ''}><summary><b>${day.date}</b> — ${events.length} 个事件</summary>`;
      events.forEach(evt => {
        const summary = (evt.summary || '').slice(0, isSparse ? 600 : 200);
        html += `<p><b>[${evt.category || '其他'}]</b> ${summary}${isSparse ? '' : '...'}</p>`;
      });
      html += '</details>';
    });

    container.innerHTML = html || '<p>暂无匹配事件</p>';
  }

  // === View 3: Knowledge Graph ===
  function renderKnowledgeGraph(result) {
    const graphData = result.graphData || {};
    const nodes = graphData.nodes || [];
    const links = graphData.links || [];

    document.getElementById('kg-nodes').textContent = nodes.length;
    document.getElementById('kg-links').textContent = links.length;

    const nodeTypes = {};
    nodes.forEach(n => { nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1; });
    document.getElementById('kg-types').textContent = Object.keys(nodeTypes).length;

    // Type filter checkboxes
    const filterDiv = document.getElementById('kg-type-filter');
    filterDiv.innerHTML = Object.keys(nodeTypes).sort().map(t =>
      `<label class="checkbox-label"><input type="checkbox" class="kg-type-cb" value="${t}" checked> ${t} (${nodeTypes[t]})</label>`
    ).join('');

    // Legend
    const types = Object.keys(nodeTypes).sort();
    const colors = generateColors(types.length);
    let legendHtml = '<span class="legend-label">图例: </span>';
    types.forEach((t, i) => {
      legendHtml += `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${t} (${nodeTypes[t]})</span>`;
    });
    document.getElementById('kg-legend').innerHTML = legendHtml;

    // Standard 2D
    renderStandardGraph(document.getElementById('kg-standard'), nodes, links, nodeTypes);

    // Node table
    const tbody = document.querySelector('#kg-node-table tbody');
    tbody.innerHTML = nodes.slice(0, 100).map(n =>
      `<tr><td>${(n.id || '').slice(0, 30)}</td><td>${n.type || 'Unknown'}</td><td>${(n.text || '').slice(0, 100)}</td></tr>`
    ).join('');

    // Type filter change
    document.querySelectorAll('.kg-type-cb').forEach(cb => {
      cb.addEventListener('change', () => updateKGFilter(graphData));
    });
  }

  function updateKGFilter(graphData) {
    const selected = [];
    document.querySelectorAll('.kg-type-cb:checked').forEach(cb => selected.push(cb.value));

    let nodes = graphData.nodes || [];
    let links = graphData.links || [];

    if (selected.length) {
      nodes = nodes.filter(n => selected.includes(n.type));
      const nodeIds = new Set(nodes.map(n => n.id));
      links = links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    }

    const nodeTypes = {};
    nodes.forEach(n => { nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1; });

    renderStandardGraph(document.getElementById('kg-standard'), nodes, links, nodeTypes);
  }

  function renderStandardGraph(container, nodes, links, nodeTypes) {
    const types = Object.keys(nodeTypes).sort();
    const colors = generateColors(types.length);
    const colorMap = {};
    types.forEach((t, i) => { colorMap[t] = colors[i]; });

    if (!nodes.length) { container.innerHTML = '<p>No nodes matching filter</p>'; return; }

    // Build adjacency list for layout
    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    links.forEach(l => {
      if (adj[l.source]) adj[l.source].push(l.target);
      if (adj[l.target]) adj[l.target].push(l.source);
    });

    // Simple layout algorithm
    const positions = simpleLayout(nodes, adj);

    // Edges
    const edgeX = [], edgeY = [];
    links.forEach(l => {
      const sp = positions[l.source];
      const tp = positions[l.target];
      if (sp && tp) { edgeX.push(sp.x, tp.x, null); edgeY.push(sp.y, tp.y, null); }
    });

    const edgeTrace = { type: 'scatter', x: edgeX, y: edgeY, mode: 'lines',
      line: { width: 0.5, color: '#888' }, hoverinfo: 'none' };

    // Nodes
    const nodeX = [], nodeY = [], nodeColor = [], nodeText = [], nodeSize = [];
    nodes.forEach(n => {
      const p = positions[n.id] || { x: 0, y: 0 };
      nodeX.push(p.x); nodeY.push(p.y);
      nodeColor.push(colorMap[n.type] || '#888');
      nodeText.push(`<b>${(n.id || '').slice(0, 30)}</b><br>Type: ${n.type}<br>${(n.text || '').slice(0, 80)}`);
      nodeSize.push(10 + (adj[n.id]?.length || 0) * 3);
    });

    const nodeTrace = { type: 'scatter', x: nodeX, y: nodeY, mode: 'markers',
      hoverinfo: 'text', hovertext: nodeText,
      marker: { color: nodeColor, size: nodeSize, line: { width: 1 } } };

    // Legend
    const legendTraces = types.map(t => ({ type: 'scatter', x: [null], y: [null], mode: 'markers',
      marker: { size: 10, color: colorMap[t] }, name: `${t} (${nodeTypes[t]})` }));

    Plotly.newPlot(container, [edgeTrace, nodeTrace, ...legendTraces], {
      title: 'Entity Relationship Network',
      showlegend: true, hovermode: 'closest',
      margin: { b: 20, l: 5, r: 5, t: 40 },
      xaxis: { showgrid: false, zeroline: false, showticklabels: false },
      yaxis: { showgrid: false, zeroline: false, showticklabels: false },
      height: 600,
    });
  }

  function render3DGraph(container, nodes, links, nodeTypes) {
    if (!nodes.length) { container.innerHTML = '<p>No data</p>'; return; }

    const types = Object.keys(nodeTypes).sort();
    const colors = generateColors(types.length);
    const colorMap = {};
    types.forEach((t, i) => { colorMap[t] = colors[i]; });

    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    links.forEach(l => {
      if (adj[l.source]) adj[l.source].push(l.target);
      if (adj[l.target]) adj[l.target].push(l.source);
    });

    const positions = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = 1 + Math.random() * 0.5;
      positions[n.id] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: (Math.random() - 0.5) * 2 };
    });

    // Edges
    const edgeX = [], edgeY = [], edgeZ = [];
    links.forEach(l => {
      const sp = positions[l.source], tp = positions[l.target];
      if (sp && tp) { edgeX.push(sp.x, tp.x, null); edgeY.push(sp.y, tp.y, null); edgeZ.push(sp.z, tp.z, null); }
    });

    const edgeTrace = { type: 'scatter3d', x: edgeX, y: edgeY, z: edgeZ, mode: 'lines',
      line: { width: 0.6, color: '#666' }, hoverinfo: 'none', name: 'Relations' };

    // Nodes per type
    const traces = [edgeTrace];
    types.forEach(t => {
      const typeNodes = nodes.filter(n => n.type === t);
      if (!typeNodes.length) return;

      traces.push({
        type: 'scatter3d',
        x: typeNodes.map(n => positions[n.id]?.x || 0),
        y: typeNodes.map(n => positions[n.id]?.y || 0),
        z: typeNodes.map(n => positions[n.id]?.z || 0),
        mode: 'markers',
        name: `${t} (${typeNodes.length})`,
        marker: { size: typeNodes.map(n => 5 + (adj[n.id]?.length || 0) * 2),
          color: colorMap[t], opacity: 0.9, line: { width: 0.5, color: '#fff' } },
        hovertext: typeNodes.map(n => `<b>${(n.id || '').slice(0, 25)}</b><br>Type: ${n.type}`),
        hoverinfo: 'text',
      });
    });

    Plotly.newPlot(container, traces, {
      scene: {
        xaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
        yaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
        zaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
        camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } },
      },
      height: 650, margin: { l: 0, r: 0, t: 0, b: 0 },
      legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(0,0,0,0.5)' },
    });
  }

  // Simple force-directed layout
  function simpleLayout(nodes, adj) {
    const positions = {};
    nodes.forEach((n, i) => {
      positions[n.id] = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10 };
    });

    for (let iter = 0; iter < 30; iter++) {
      const forces = {};
      nodes.forEach(n => {
        forces[n.id] = { x: 0, y: 0 };
        // Repulsion
        nodes.forEach(m => {
          if (n.id === m.id) return;
          const dx = positions[n.id].x - positions[m.id].x;
          const dy = positions[n.id].y - positions[m.id].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5 / (dist * dist);
          forces[n.id].x += (dx / dist) * force;
          forces[n.id].y += (dy / dist) * force;
        });
        // Attraction
        (adj[n.id] || []).forEach(neighbor => {
          if (!positions[neighbor]) return;
          const dx = positions[n.id].x - positions[neighbor].x;
          const dy = positions[n.id].y - positions[neighbor].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          forces[n.id].x -= dx * 0.01;
          forces[n.id].y -= dy * 0.01;
        });
      });

      nodes.forEach(n => {
        positions[n.id].x += forces[n.id].x * 0.1;
        positions[n.id].y += forces[n.id].y * 0.1;
      });
    }

    return positions;
  }

  // === View 4: Spatial ===
  function renderSpatial(result) {
    const spatialData = result.spatialData || {};
    const locations = spatialData.locations || [];
    if (!locations.length) return;

    document.getElementById('sp-locations').textContent = locations.length;
    document.getElementById('sp-top').textContent = spatialData.topLocation?.name || '-';
    document.getElementById('sp-mentions').textContent = locations.reduce((s, l) => s + (l.mention_count || 0), 0);

    // Map
    const maxCount = Math.max(...locations.map(l => l.mention_count || 0));
    Plotly.newPlot('chart-spatial-map', [{
      type: 'scattergeo',
      lon: locations.map(l => l.lng),
      lat: locations.map(l => l.lat),
      text: locations.map(l => `<b>${l.name}</b><br>Mentions: ${l.mention_count}`),
      mode: 'markers+text',
      marker: {
        size: locations.map(l => 10 + ((l.mention_count || 1) / maxCount) * 40),
        color: locations.map(l => l.mention_count),
        colorscale: 'Reds', showscale: true,
        colorbar: { title: 'Mentions' },
        line: { width: 1, color: 'white' },
      },
      textposition: 'top center',
      textfont: { size: 10 },
    }], {
      geo: {
        projection_type: 'natural earth', showland: true,
        landcolor: 'rgb(243,243,243)', coastlinecolor: 'rgb(204,204,204)',
        showcountries: true, countrycolor: 'rgb(204,204,204)',
        center: { lat: 28, lon: 45 }, projection_scale: 3.5,
      },
      height: 550, margin: { l: 10, r: 10, t: 10, b: 10 },
    });

    // Table
    document.querySelector('#spatial-table tbody').innerHTML = locations.map(l =>
      `<tr><td>${l.name}</td><td>${l.lat.toFixed(2)}</td><td>${l.lng.toFixed(2)}</td><td>${l.mention_count}</td></tr>`
    ).join('');

    // Bar chart
    const top15 = locations.slice(0, 15);
    Plotly.newPlot('chart-spatial-bar', [{
      type: 'bar',
      x: top15.map(l => l.name),
      y: top15.map(l => l.mention_count),
    }], { height: 350, margin: { l: 10, r: 10, t: 40, b: 10 }, xaxis: { title: '地点' }, yaxis: { title: '提及次数' } });
  }

  // === View 5: Source Analysis ===
  function renderSourceAnalysis(result) {
    const stats = result.stats || {};
    const meta = stats.meta || {};

    document.getElementById('src-name').textContent = (result.fileName || 'N/A').slice(0, 20);
    document.getElementById('src-chunks').textContent = meta.totalChunks || 0;
    document.getElementById('src-avg').textContent = (stats.meanChunkSize || 0) + ' 字符';
    document.getElementById('src-chars').textContent = (stats.totalChars || 0).toLocaleString();

    // Box plot
    const lengths = stats.textLengths || [];
    if (lengths.length) {
      Plotly.newPlot('chart-boxplot', [{
        type: 'box', y: lengths, name: 'Text Chunk Sizes',
      }], { height: 300, margin: { l: 10, r: 10, t: 40, b: 10 } });
    }

    // Treemap
    const entityDist = stats.entityDistribution || {};
    if (Object.keys(entityDist).length) {
      Plotly.newPlot('chart-treemap', [{
        type: 'treemap',
        labels: Object.keys(entityDist),
        values: Object.values(entityDist),
        parents: Object.keys(entityDist).map(() => ''),
      }], { height: 300, margin: { l: 10, r: 10, t: 40, b: 10 } });
    }

    // Sankey & Heatmap
    const edges = result.edges || [];
    if (edges.length) {
      // Sankey
      const pairs = {};
      edges.forEach(e => {
        const key = (e.source_type || 'Unknown') + '→' + (e.target_type || 'Unknown');
        pairs[key] = (pairs[key] || 0) + 1;
      });

      const labels = [...new Set(edges.flatMap(e => [e.source_type || 'Unknown', e.target_type || 'Unknown']))];
      const labelIdx = {};
      labels.forEach((l, i) => { labelIdx[l] = i; });

      const sources = [], targets = [], values = [];
      Object.entries(pairs).slice(0, 15).forEach(([key, count]) => {
        const [src, tgt] = key.split('→');
        sources.push(labelIdx[src]);
        targets.push(labelIdx[tgt]);
        values.push(count);
      });

      Plotly.newPlot('chart-sankey', [{
        type: 'sankey',
        node: { pad: 15, thickness: 20, line: { color: 'black', width: 0.5 }, label: labels },
        link: { source: sources, target: targets, value: values },
      }], { height: 400, margin: { l: 10, r: 10, t: 40, b: 10 } });

      // Heatmap
      const srcTypes = [...new Set(edges.map(e => e.source_type || 'Unknown'))].sort();
      const tgtTypes = [...new Set(edges.map(e => e.target_type || 'Unknown'))].sort();
      const matrix = srcTypes.map(() => tgtTypes.map(() => 0));
      edges.forEach(e => {
        const si = srcTypes.indexOf(e.source_type || 'Unknown');
        const ti = tgtTypes.indexOf(e.target_type || 'Unknown');
        if (si >= 0 && ti >= 0) matrix[si][ti]++;
      });

      Plotly.newPlot('chart-heatmap', [{
        type: 'heatmap',
        z: matrix, x: tgtTypes, y: srcTypes, colorscale: 'Viridis',
      }], { height: 400, margin: { l: 10, r: 10, t: 40, b: 10 }, xaxis: { title: '目标类型' }, yaxis: { title: '源类型' } });
    }
  }

  // --- Utility ---
  function showStatus(type, message, sectionId) {
    const container = document.getElementById(sectionId);
    if (!container) return;
    let statusEl = container.querySelector('.status-message');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'status-message';
      container.appendChild(statusEl);
    }
    statusEl.className = `status-message status-${type}`;
    statusEl.textContent = message;
    setTimeout(() => { statusEl.textContent = ''; }, 5000);
  }
})();
