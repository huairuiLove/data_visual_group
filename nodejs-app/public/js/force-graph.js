/**
 * 力导向图 (Force-Directed Graph)
 * 使用 vis.js Network 替代 Python pyvis
 */
function renderForceGraph(container, nodes, links, nodeTypes) {
  container.innerHTML = '';

  const types = Object.keys(nodeTypes).sort();
  const colors = generateColors(types.length);
  const colorMap = {};
  types.forEach((t, i) => { colorMap[t] = colors[i]; });

  // Count degrees
  const degrees = {};
  links.forEach(l => {
    const src = String(l.source || '');
    const tgt = String(l.target || '');
    degrees[src] = (degrees[src] || 0) + 1;
    degrees[tgt] = (degrees[tgt] || 0) + 1;
  });

  // Build vis nodes
  const visNodes = new vis.DataSet(
    nodes.map(n => {
      const nid = String(n.id || '');
      const label = (n.text || nid).slice(0, 20);
      const deg = degrees[nid] || 0;
      return {
        id: nid,
        label,
        title: `<b>${n.type || 'Unknown'}</b><br>${(n.text || '').slice(0, 150)}`,
        color: {
          background: colorMap[n.type] || '#888888',
          border: '#444',
          highlight: { background: colorMap[n.type] || '#888888', border: '#fff' },
        },
        size: 8 + deg * 3,
        borderWidth: 1,
        borderWidthSelected: 2,
        shape: 'dot',
        font: { size: 11, color: '#ccc', face: 'Arial' },
      };
    })
  );

  // Build vis edges
  const visEdges = new vis.DataSet(
    links
      .filter(l => visNodes.get(String(l.source)) && visNodes.get(String(l.target)))
      .map(l => ({
        from: String(l.source),
        to: String(l.target),
        title: l.type || 'UNKNOWN',
        color: { color: '#555555', opacity: 0.6 },
        width: 0.8,
        arrows: 'to',
        smooth: { type: 'continuous' },
      }))
  );

  const network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
    width: '100%',
    height: '100%',
    physics: {
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 120,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.1,
      },
      maxVelocity: 50,
      minVelocity: 0.75,
      stabilization: { iterations: 300, updateInterval: 25 },
      solver: 'barnesHut',
      timestep: 0.5,
    },
    interaction: {
      dragNodes: true,
      dragView: true,
      zoomView: true,
      hover: true,
      hoverConnectedEdges: true,
      navigationButtons: true,
      keyboard: { enabled: true, bindToWindow: false },
      tooltipDelay: 200,
    },
    edges: { smooth: { type: 'continuous', forceDirection: 'none' } },
    nodes: { font: { size: 11, face: 'Arial', strokeWidth: 0 } },
  });
}
