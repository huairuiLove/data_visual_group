/**
 * 2D/3D 动态网图引擎 — D3 力导向 + 时间帧动画
 */

import * as d3 from 'd3'
import { generateColors } from './usePlotly'

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
    const h = options.height || 600

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

    const g = svg.append('g')

    const nodesData = nodes.map((n, i) => ({
      id: String(n.id),
      type: n.type,
      text: n.text || n.id,
      color: colorMap[n.type] || '#888',
      r: 6 + (i % 5),
      pulsePhase: Math.random() * Math.PI * 2,
    }))

    const nodeIds = new Set(nodesData.map(n => n.id))
    const linksData = links
      .filter(l => nodeIds.has(String(l.source)) && nodeIds.has(String(l.target)))
      .map(l => ({ source: String(l.source), target: String(l.target), type: l.type || '' }))

    simulation = d3.forceSimulation(nodesData)
      .force('link', d3.forceLink(linksData).id(d => d.id).distance(90).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(18))

    const link = g.append('g')
      .selectAll('line')
      .data(linksData)
      .join('line')
      .attr('stroke', '#555')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1)

    const node = g.append('g')
      .selectAll('circle')
      .data(nodesData)
      .join('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.85)
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

    node.append('title').text(d => `${d.id} (${d.type})`)

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
    })

    // Pulse animation
    let frame = 0
    function animate() {
      frame++
      const t = frame * 0.03
      node.attr('r', d => d.r + Math.sin(t + d.pulsePhase) * 2)
      link.attr('stroke-opacity', 0.3 + Math.sin(t * 0.5) * 0.2)
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return { stop, simulation }
  }

  return { render2DDynamic, stop }
}
