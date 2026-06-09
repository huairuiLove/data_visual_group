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
    const relationSequence = options.relationSequence || links || []

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

    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrow-flow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#8fd3ff')

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
      firstStep: Infinity,
      activeDegree: 0,
    }))

    const nodeIds = new Set(nodesData.map(n => n.id))
    const linksData = links
      .filter(l => nodeIds.has(String(l.source)) && nodeIds.has(String(l.target)))
      .map((l, index) => ({
        source: String(l.source),
        target: String(l.target),
        type: l.type || l.relation || '',
        count: l.count || 1,
        step: Number.isFinite(l.step) ? l.step : index,
      }))
      .sort((a, b) => a.step - b.step)
    const maxStep = Math.max(0, ...linksData.map((link) => link.step))

    const firstStepByNode = new Map()
    const degreeByNode = new Map()
    for (const link of linksData) {
      firstStepByNode.set(link.source, Math.min(firstStepByNode.get(link.source) ?? Infinity, link.step))
      firstStepByNode.set(link.target, Math.min(firstStepByNode.get(link.target) ?? Infinity, link.step))
      degreeByNode.set(link.source, (degreeByNode.get(link.source) || 0) + 1)
      degreeByNode.set(link.target, (degreeByNode.get(link.target) || 0) + 1)
    }
    for (const node of nodesData) {
      node.firstStep = firstStepByNode.get(node.id) ?? Infinity
      node.activeDegree = degreeByNode.get(node.id) || 0
      node.r = Math.max(node.r, 6 + Math.min(10, Math.sqrt(node.activeDegree) * 2.5))
    }

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
      .attr('marker-end', 'url(#arrow-flow)')

    const flowParticles = g.append('g')
      .selectAll('circle')
      .data(linksData.slice(0, 80))
      .join('circle')
      .attr('r', d => 2.5 + Math.min(3, Math.sqrt(d.count || 1)))
      .attr('fill', '#f6d365')
      .attr('opacity', 0)

    const stageLabel = svg.append('text')
      .attr('x', 18)
      .attr('y', 28)
      .attr('fill', '#dcefff')
      .attr('font-size', 13)
      .attr('font-weight', 700)

    const stageHint = svg.append('text')
      .attr('x', 18)
      .attr('y', 48)
      .attr('fill', '#94a3b8')
      .attr('font-size', 11)

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
      const stepWindow = maxStep + 1
      const activeStep = Math.floor(frame / 38) % stepWindow
      const activeLinks = linksData.filter(d => d.step <= activeStep)
      const activeNodes = new Set()
      for (const d of activeLinks) {
        activeNodes.add(d.source.id || d.source)
        activeNodes.add(d.target.id || d.target)
      }

      node.selectAll('circle')
        .attr('r', d => {
          const active = activeNodes.has(d.id)
          const entering = d.firstStep === activeStep
          return d.r + (active ? 1.5 : 0) + (entering ? 5 : 0) + Math.sin(t + d.pulsePhase) * (active ? 1.4 : 0.4)
        })
        .attr('opacity', d => activeNodes.has(d.id) ? 0.95 : 0.25)
        .attr('stroke-width', d => d.firstStep === activeStep ? 3 : 1)

      link
        .attr('stroke', d => d.step === activeStep ? '#f6d365' : d.step < activeStep ? '#58c7ff' : '#3b4455')
        .attr('stroke-opacity', d => d.step <= activeStep ? (d.step === activeStep ? 0.95 : 0.42) : 0.08)
        .attr('stroke-width', d => d.step === activeStep ? 2.8 + Math.sqrt(d.count || 1) : 1 + Math.min(3, Math.sqrt(d.count || 1) * 0.4))

      flowParticles
        .attr('opacity', d => d.step <= activeStep ? (d.step === activeStep ? 0.95 : 0.45) : 0)
        .attr('cx', d => {
          const p = ((t * 0.9 + d.step * 0.17) % 1)
          return d.source.x + (d.target.x - d.source.x) * p
        })
        .attr('cy', d => {
          const p = ((t * 0.9 + d.step * 0.17) % 1)
          return d.source.y + (d.target.y - d.source.y) * p
        })

      const current = relationSequence.filter((rel) => (Number.isFinite(rel.step) ? rel.step : 0) === activeStep).slice(0, 3)
      stageLabel.text(`传导阶段 ${activeStep + 1}/${stepWindow} · 已激活关系 ${activeLinks.length}/${linksData.length}`)
      stageHint.text(current.map((rel) => `${rel.source} → ${rel.target}`).join('  |  '))
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return { stop, simulation }
  }

  return { render2DDynamic, stop }
}
