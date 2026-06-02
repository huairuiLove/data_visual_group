/**
 * 鱼眼可视化 (Fisheye Graph View)
 * 原 Python advanced_viz.py 中的嵌入式 HTML 现在变成了独立的 JS 模块
 * 使用 D3.js v7 力仿真 + 鱼眼扭曲变换
 */
function renderFisheyeGraph(container, nodes, links, nodeTypes) {
  // Clear container
  container.innerHTML = '';

  // Generate colors per type
  const types = Object.keys(nodeTypes).sort();
  const colors = generateColors(types.length);
  const colorMap = {};
  types.forEach((t, i) => { colorMap[t] = colors[i]; });

  // Prepare data
  const nodesData = nodes.map(n => ({
    id: String(n.id || ''),
    type: n.type || 'Unknown',
    text: (n.text || '').slice(0, 200),
    color: colorMap[n.type] || '#888888',
    count: nodeTypes[n.type] || 0,
  }));

  const nodeIdToIdx = {};
  nodesData.forEach((n, i) => { nodeIdToIdx[n.id] = i; });

  const linksData = links
    .map(l => ({ source: String(l.source || ''), target: String(l.target || ''), type: l.type || 'UNKNOWN' }))
    .filter(l => l.source in nodeIdToIdx && l.target in nodeIdToIdx)
    .map(l => ({ source: nodeIdToIdx[l.source], target: nodeIdToIdx[l.target], type: l.type }));

  // Legend
  let legendHtml = '<div class="fisheye-legend">';
  types.forEach(t => {
    legendHtml += `<div class="fisheye-legend-item">
      <span class="fisheye-legend-dot" style="background:${colorMap[t]}"></span>${t}
    </div>`;
  });
  legendHtml += '</div>';

  const tooltip = document.createElement('div');
  tooltip.className = 'fisheye-tooltip';
  tooltip.style.display = 'none';

  container.style.position = 'relative';
  container.style.background = '#1a1a2e';
  container.style.borderRadius = '8px';
  container.style.overflow = 'hidden';
  container.style.cursor = 'crosshair';
  container.innerHTML = legendHtml;
  container.appendChild(tooltip);

  const w = container.clientWidth;
  const h = container.clientHeight;

  const svg = d3.select(container).append('svg')
    .attr('width', w).attr('height', h);

  const g = svg.append('g');

  // Force simulation
  const simulation = d3.forceSimulation(nodesData)
    .force('link', d3.forceLink(linksData).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide().radius(15));

  // Fisheye transform
  function fisheyeTransform(d, mx, my, radius) {
    const dx = d.x - mx;
    const dy = d.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return { x: d.x, y: d.y, scale: 2.5 };

    let newDist;
    if (dist < radius) {
      newDist = radius * Math.sqrt(dist / radius);
    } else {
      newDist = radius + (dist - radius) * 0.5;
    }

    const ratio = newDist / dist;
    const scale = dist < radius ? 2.5 * (1 - dist / radius) + 0.3 : 0.3;

    return {
      x: mx + dx * ratio,
      y: my + dy * ratio,
      scale: Math.max(0.3, scale),
    };
  }

  let fisheyeCenter = { x: w / 2, y: h / 2 };
  let fisheyeRadius = 180;
  let mouseActive = false;

  // Draw edges
  const linkElements = g.append('g').selectAll('line')
    .data(linksData).join('line')
    .attr('stroke', '#555')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 0.8);

  // Draw nodes
  const nodeElements = g.append('g').selectAll('g')
    .data(nodesData).join('g').attr('cursor', 'pointer');

  nodeElements.append('circle')
    .attr('r', d => 4 + Math.sqrt(d.count || 1) * 2)
    .attr('fill', d => d.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.5)
    .attr('stroke-opacity', 0.3);

  nodeElements.append('text')
    .attr('class', 'fisheye-node-label')
    .attr('dy', d => -7 - Math.sqrt(d.count || 1) * 1.5)
    .text(d => d.id.substring(0, 10));

  // Mouse interaction
  d3.select(container).on('mousemove', function(event) {
    const rect = container.getBoundingClientRect();
    mouseActive = true;
    fisheyeCenter = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    const nearNode = nodesData.find(d => {
      const dx = d.x - fisheyeCenter.x;
      const dy = d.y - fisheyeCenter.y;
      return Math.sqrt(dx * dx + dy * dy) < 30;
    });

    if (nearNode) {
      tooltip.style.display = 'block';
      tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
      tooltip.style.top = (event.clientY - rect.top - 20) + 'px';
      tooltip.innerHTML = `<b>${nearNode.type}</b><br>${nearNode.text.substring(0, 180)}`;
    } else {
      tooltip.style.display = 'none';
    }
  });

  d3.select(container).on('mouseleave', () => {
    mouseActive = false;
    fisheyeCenter = { x: w / 2, y: h / 2 };
    tooltip.style.display = 'none';
  });

  d3.select(container).on('wheel', (event) => {
    event.preventDefault();
    fisheyeRadius = Math.max(40, Math.min(350, fisheyeRadius - event.deltaY * 0.3));
  });

  // Tick update
  simulation.on('tick', () => {
    linkElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodeElements.each(function(d) {
      const t = mouseActive
        ? fisheyeTransform(d, fisheyeCenter.x, fisheyeCenter.y, fisheyeRadius)
        : { x: d.x, y: d.y, scale: 1.0 };

      d3.select(this).select('circle')
        .attr('cx', t.x).attr('cy', t.y)
        .attr('r', (4 + Math.sqrt(d.count || 1) * 2) * t.scale);

      d3.select(this).select('text')
        .attr('x', t.x).attr('y', t.y)
        .attr('dy', -7 * t.scale - Math.sqrt(d.count || 1) * 1.5 * t.scale)
        .style('font-size', (9 * t.scale) + 'px')
        .style('opacity', t.scale < 0.5 ? 0 : Math.min(1, t.scale));
    });
  });
}

// Shared color generator
function generateColors(n) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const h = (i / n) * 360;
    const s = 0.7;
    const l = 0.55;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);
    colors.push(`rgb(${r},${g},${b})`);
  }
  return colors;
}
