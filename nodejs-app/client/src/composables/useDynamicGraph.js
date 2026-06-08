/**
 * 2D/3D 动态网图引擎 — D3 力导向 + 时间帧动画
 */

import * as d3 from 'd3'
import { generateColors } from './usePlotly'
import { escapeHtml } from '../utils/html'

export function useDynamicGraph() {
  let animationId = null
  let simulation = null

  function stop() {
    if (animationId) cancelAnimationFrame(animationId)
    animationId = null
    if (simulation) simulation.stop()
    simulation = null
  }

  function render2DDynamic(container, nodes, links, options = {}) {
    stop()
    container.replaceChildren()

    const w = container.clientWidth || 800
    const h = options.height || 620

    const types = [...new Set(nodes.map(n => n.type))].sort()
    const colors = generateColors(types.length)
    const colorMap = {}
    types.forEach((t, i) => { colorMap[t] = colors[i] })

    const svg = d3.select(container)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('background', '#1a1a2e')
      .style('border-radius', '8px')

    // Tooltip
    const tooltip = container.appendChild(document.createElement('div'))
    Object.assign(tooltip.style, {
      position: 'absolute', zIndex: '10', pointerEvents: 'none',
      background: 'rgba(0,0,0,0.9)', color: '#eee', padding: '8px 12px',
      borderRadius: '6px', fontSize: '12px', maxWidth: '260px',
      border: '1px solid rgba(255,255,255,0.2)', display: 'none',
    })

    const g = svg.append('g')

    // Bounding margin (% of width/height)
    const margin = 0.1

    const nodesData = nodes.map((n, i) => ({
      id: String(n.id),
      type: n.type || 'Unknown',
      text: n.text || n.id,
      color: colorMap[n.type] || '#888',
      r: 5 + Math.min(i % 6, 5),
      pulsePhase: Math.random() * Math.PI * 2,
    }))

    const nodeIds = new Set(nodesData.map(n => n.id))
    const linksData = links
      .filter(l => nodeIds.has(String(l.source)) && nodeIds.has(String(l.target)))
      .map(l => ({ source: String(l.source), target: String(l.target), type: l.type || '' }))

    simulation = d3.forceSimulation(nodesData)
      .force('link', d3.forceLink(linksData).id(d => d.id).distance(80).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(18))
      .force('bounds', () => {
        // Keep nodes within SVG bounds
        for (const d of nodesData) {
          d.x = Math.max(margin * w, Math.min((1 - margin) * w, d.x))
          d.y = Math.max(margin * h, Math.min((1 - margin) * h, d.y))
        }
      })

    const link = g.append('g')
      .selectAll('line')
      .data(linksData)
      .join('line')
      .attr('stroke', '#555')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1)

    const node = g.append('g')
      .selectAll('g')
      .data(nodesData)
      .join('g')
      .attr('cursor', 'pointer')

    node.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('opacity', 0.85)

    // Label
    node.append('text')
      .attr('dy', d => -d.r - 4)
      .attr('text-anchor', 'middle')
      .style('fill', '#ccc')
      .style('font-size', '8px')
      .style('pointer-events', 'none')
      .text(d => d.id.substring(0, 12))

    // Hover behavior
    node.on('mouseenter', (event, d) => {
        const rect = container.getBoundingClientRect()
        tooltip.innerHTML = `<b>${escapeHtml(d.type)}</b><br/>${escapeHtml(d.text.substring(0, 150))}`
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

      // Drag
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

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Pulse animation
    let frame = 0
    function animate() {
      frame++
      const t = frame * 0.03
      node.selectAll('circle')
        .attr('r', d => d.r + Math.sin(t + d.pulsePhase) * 2)
      link.attr('stroke-opacity', 0.3 + Math.sin(t * 0.5) * 0.2)
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return { stop, simulation }
  }

  return { render2DDynamic, stop }
}
