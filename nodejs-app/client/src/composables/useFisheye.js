/**
 * D3.js Fisheye Graph - Vue 3 Composable
 * 原来在 Python advanced_viz.py 里作为一个 230 行的 f-string
 */
import { onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { generateColors } from './usePlotly'
import { escapeHtml } from '../utils/html'

export function useFisheye(elRef) {
  let cleanup = () => {}
  let simulation = null

  function render(nodes, links, nodeTypes) {
    nextTick(() => {
      const container = elRef.value
      if (!container) return

      // Stop previous simulation
      if (simulation) { simulation.stop(); simulation = null }
      cleanup()

      container.replaceChildren()
      const types = Object.keys(nodeTypes).sort()
      const colors = generateColors(types.length)
      const colorMap = {}
      types.forEach((t, i) => { colorMap[t] = colors[i] })

      const nodesData = nodes.map(n => ({
        id: String(n.id || ''),
        type: n.type || 'Unknown',
        text: (n.text || '').slice(0, 200),
        color: colorMap[n.type] || '#888',
        count: nodeTypes[n.type] || 0,
      }))

      const nodeIdToIdx = {}
      nodesData.forEach((n, i) => { nodeIdToIdx[n.id] = i })

      const linksData = links
        .map(l => ({ source: String(l.source || ''), target: String(l.target || ''), type: l.type || 'UNKNOWN' }))
        .filter(l => l.source in nodeIdToIdx && l.target in nodeIdToIdx)
        .map(l => ({ source: nodeIdToIdx[l.source], target: nodeIdToIdx[l.target], type: l.type }))

      // Legend
      const legend = document.createElement('div')
      legend.className = 'fisheye-legend'
      legend.style.cssText = 'position:absolute;top:10px;right:10px;z-index:5;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:6px;font-size:11px;color:#ccc;pointer-events:none;'
      types.forEach((type) => {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;align-items:center;margin:2px 0;gap:6px'
        const dot = document.createElement('span')
        dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${colorMap[type]}`
        const label = document.createElement('span')
        label.textContent = type
        row.append(dot, label)
        legend.appendChild(row)
      })
      container.style.position = 'relative'
      container.style.background = '#1a1a2e'
      container.style.borderRadius = '8px'
      container.style.overflow = 'hidden'
      container.style.cursor = 'crosshair'
      container.appendChild(legend)

      const tooltip = document.createElement('div')
      tooltip.style.cssText = 'position:absolute;z-index:10;pointer-events:none;background:rgba(0,0,0,0.9);color:#eee;padding:8px 12px;border-radius:6px;font-size:12px;max-width:280px;border:1px solid rgba(255,255,255,0.2);display:none;'
      container.appendChild(tooltip)

      // Use container's min-height if clientHeight is 0
      const w = container.clientWidth || 800
      const h = container.clientHeight || 620

      const svg = d3.select(container).append('svg').attr('width', w).attr('height', h)
      const g = svg.append('g')

      // Bounding margin
      const margin = 0.08

      simulation = d3.forceSimulation(nodesData)
        .force('link', d3.forceLink(linksData).id(d => d.id).distance(70))
        .force('charge', d3.forceManyBody().strength(-180))
        .force('center', d3.forceCenter(w / 2, h / 2))
        .force('collision', d3.forceCollide().radius(14))
        .force('bounds', () => {
          for (const d of nodesData) {
            d.x = Math.max(margin * w, Math.min((1 - margin) * w, d.x))
            d.y = Math.max(margin * h, Math.min((1 - margin) * h, d.y))
          }
        })

      function fisheyeTransform(d, mx, my, radius) {
        const dx = d.x - mx, dy = d.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) return { x: d.x, y: d.y, scale: 2.5 }
        const newDist = dist < radius ? radius * Math.sqrt(dist / radius) : radius + (dist - radius) * 0.5
        const ratio = newDist / dist
        const scale = dist < radius ? 2.5 * (1 - dist / radius) + 0.3 : 0.3
        return { x: mx + dx * ratio, y: my + dy * ratio, scale: Math.max(0.3, scale) }
      }

      let fisheyeCenter = { x: w / 2, y: h / 2 }, fisheyeRadius = 180, mouseActive = false

      const linkElements = g.append('g').selectAll('line').data(linksData).join('line')
        .attr('stroke', '#555').attr('stroke-opacity', 0.4).attr('stroke-width', 0.8)

      const nodeG = g.append('g').selectAll('g').data(nodesData).join('g').attr('cursor', 'pointer')

      nodeG.append('circle')
        .attr('r', d => 4 + Math.sqrt(d.count || 1) * 2)
        .attr('fill', d => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('stroke-opacity', 0.3)

      nodeG.append('text')
        .attr('class', 'fisheye-label')
        .attr('dy', d => -7 - Math.sqrt(d.count || 1) * 1.5)
        .style('font-size', '9px')
        .style('fill', '#ccc')
        .style('pointer-events', 'none')
        .style('text-anchor', 'middle')
        .text(d => d.id.substring(0, 12))

      // Hover and drag on node groups
      nodeG.on('mouseenter', (event, d) => {
          const rect = container.getBoundingClientRect()
          tooltip.innerHTML = `<b>${escapeHtml(d.type)}</b><br/>${escapeHtml(d.text.substring(0, 180))}`
          tooltip.style.display = 'block'
          tooltip.style.left = (event.clientX - rect.left + 15) + 'px'
          tooltip.style.top = (event.clientY - rect.top - 20) + 'px'
        })
        .on('mousemove', (event) => {
          const rect = container.getBoundingClientRect()
          tooltip.style.left = (event.clientX - rect.left + 15) + 'px'
          tooltip.style.top = (event.clientY - rect.top - 20) + 'px'
        })
        .on('mouseleave', () => { tooltip.style.display = 'none' })
        .call(d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          }))

      const svgNode = svg.node()

      // Fisheye mouse tracking on SVG
      svg.on('mousemove', (event) => {
        const rect = svgNode.getBoundingClientRect()
        mouseActive = true
        fisheyeCenter = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      })

      svg.on('mouseleave', () => { mouseActive = false; fisheyeCenter = { x: w / 2, y: h / 2 } })

      svg.on('wheel', (event) => {
        event.preventDefault()
        fisheyeRadius = Math.max(40, Math.min(350, fisheyeRadius - event.deltaY * 0.3))
      })

      simulation.on('tick', () => {
        linkElements.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)

        nodeG.each(function(d) {
          const t = mouseActive ? fisheyeTransform(d, fisheyeCenter.x, fisheyeCenter.y, fisheyeRadius) : { x: d.x, y: d.y, scale: 1.0 }
          d3.select(this).select('circle')
            .attr('cx', t.x).attr('cy', t.y)
            .attr('r', (4 + Math.sqrt(d.count || 1) * 2) * t.scale)
          d3.select(this).select('text')
            .attr('x', t.x).attr('y', t.y)
            .attr('dy', -7 * t.scale - Math.sqrt(d.count || 1) * 1.5 * t.scale)
            .style('font-size', (9 * t.scale) + 'px')
            .style('opacity', t.scale < 0.5 ? 0 : Math.min(1, t.scale))
        })
      })

      cleanup = () => {
        if (simulation) { simulation.stop(); simulation = null }
        container.replaceChildren()
      }
    })
  }

  onUnmounted(() => cleanup())

  return { render }
}

export function useForceGraph(elRef) {
  let network = null

  function render(nodes, links, nodeTypes) {
    import('vis-network/standalone').then(({ Network, DataSet }) => {
      const container = elRef.value
      if (!container) return
      container.replaceChildren()

      const types = Object.keys(nodeTypes).sort()
      const colors = generateColors(types.length)
      const colorMap = {}
      types.forEach((t, i) => { colorMap[t] = colors[i] })

      const degrees = {}
      links.forEach(l => {
        const s = String(l.source || ''), t = String(l.target || '')
        degrees[s] = (degrees[s] || 0) + 1; degrees[t] = (degrees[t] || 0) + 1
      })

      const visNodes = new DataSet(nodes.map(n => {
        const nid = String(n.id || '')
        const degree = degrees[nid] || 0
        return {
          id: nid,
          label: ((n.text || nid).slice(0, 24)),
          title: `<div style="padding:4px"><b style="color:#4a9eff">${escapeHtml(n.type || 'Unknown')}</b><br/>${escapeHtml((n.text || '').slice(0, 200))}</div>`,
          color: { background: colorMap[n.type] || '#888', border: '#666', highlight: { background: '#fff', border: '#4a9eff' } },
          size: Math.max(14, 10 + degree * 4),
          borderWidth: 2,
          shape: 'dot',
          font: { size: 11, color: '#ddd', face: 'Arial' },
        }
      }))

      const visEdges = new DataSet(
        links.filter(l => visNodes.get(String(l.source)) && visNodes.get(String(l.target)))
        .map(l => ({
          from: String(l.source), to: String(l.target),
          title: l.type || 'UNKNOWN',
          color: { color: '#555', opacity: 0.6 }, width: 0.8, arrows: 'to',
        }))
      )

      network = new Network(container, { nodes: visNodes, edges: visEdges }, {
        width: '100%', height: '100%',
        physics: {
          barnesHut: { gravitationalConstant: -3000, centralGravity: 0.5, springLength: 100, springConstant: 0.04, damping: 0.09, avoidOverlap: 0.2 },
          maxVelocity: 60, minVelocity: 0.5, stabilization: { iterations: 250, updateInterval: 25 },
          solver: 'barnesHut', timestep: 0.4,
        },
        interaction: {
          dragNodes: true, dragView: true, zoomView: true, hover: true,
          hoverConnectedEdges: true, navigationButtons: true,
          keyboard: { enabled: true, bindToWindow: false },
          tooltipDelay: 150,
        },
        nodes: { shape: 'dot', borderWidth: 2 },
        edges: { smooth: { type: 'continuous', roundness: 0.3 } },
      })
    })
  }

  onUnmounted(() => {
    if (network) network.destroy()
  })

  return { render }
}
