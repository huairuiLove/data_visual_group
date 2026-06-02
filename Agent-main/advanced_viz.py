"""
高级交互可视化模块 - 力导向图、鱼眼视图、三维视图
"""

import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components
import networkx as nx
import numpy as np
import json
import tempfile
import os
from typing import Dict, Any, List
from collections import Counter
import colorsys


# ============================================================
# 颜色工具 (避免循环引用)
# ============================================================

def _generate_colors(n: int) -> List[str]:
    """生成n种不同颜色"""
    return [
        f"rgb({int(r*255)},{int(g*255)},{int(b*255)})"
        for r, g, b in [colorsys.hsv_to_rgb(i / n, 0.7, 0.9) for i in range(n)]
    ]


# ============================================================
# 1. 力导向动画图 (pyvis + vis.js)
# ============================================================

def render_force_directed_graph(
    nodes: List[Dict],
    links: List[Dict],
    node_types: Dict[str, int],
    height: int = 650,
):
    """使用 pyvis 渲染力导向图，支持节点拖拽、物理仿真、缩放平移"""
    from pyvis.network import Network

    # 颜色映射
    types_list = sorted(node_types.keys())
    colors = _generate_colors(len(types_list))
    color_map = dict(zip(types_list, colors))

    # 计算节点度数
    degree_counter = Counter()
    for link in links:
        src = str(link.get("source", ""))
        tgt = str(link.get("target", ""))
        degree_counter[src] += 1
        degree_counter[tgt] += 1

    net = Network(
        height=f"{height}px",
        width="100%",
        bgcolor="#1a1a2e",
        font_color="#e0e0e0",
        directed=False,
    )

    # 添加节点
    for node in nodes:
        nid = str(node.get("id", ""))
        ntype = node.get("type", "Unknown")
        text = node.get("text", nid)
        label = (text or nid)[:20]
        title_text = f"<b>{ntype}</b><br>{text[:150]}"
        degree = degree_counter.get(nid, 0)
        node_size = 8 + degree * 3

        net.add_node(
            nid,
            label=label,
            title=title_text,
            color=color_map.get(ntype, "#888888"),
            size=node_size,
            borderWidth=1,
            borderWidthSelected=2,
            shape="dot",
        )

    # 添加边
    for link in links:
        src = str(link.get("source", ""))
        tgt = str(link.get("target", ""))
        rtype = link.get("type", "UNKNOWN")
        if src in net.node_ids and tgt in net.node_ids:
            net.add_edge(
                src,
                tgt,
                title=rtype,
                color={"color": "#555555", "opacity": 0.6},
                width=0.8,
                arrows="to",
            )

    # 物理引擎配置
    physics_config = {
        "physics": {
            "barnesHut": {
                "gravitationalConstant": -2000,
                "centralGravity": 0.3,
                "springLength": 120,
                "springConstant": 0.04,
                "damping": 0.09,
                "avoidOverlap": 0.1,
            },
            "maxVelocity": 50,
            "minVelocity": 0.75,
            "stabilization": {
                "enabled": True,
                "iterations": 300,
                "updateInterval": 25,
            },
            "solver": "barnesHut",
            "timestep": 0.5,
        },
        "interaction": {
            "dragNodes": True,
            "dragView": True,
            "zoomView": True,
            "hover": True,
            "hoverConnectedEdges": True,
            "navigationButtons": True,
            "keyboard": {
                "enabled": True,
                "bindToWindow": False,
            },
            "tooltipDelay": 200,
        },
        "edges": {
            "smooth": {"type": "continuous", "forceDirection": "none"},
        },
        "nodes": {
            "font": {"size": 11, "face": "Arial", "strokeWidth": 0},
        },
    }

    net.set_options(json.dumps(physics_config))

    # 渲染为 HTML 并嵌入 Streamlit
    with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w", encoding="utf-8") as tmp:
        net.save_graph(tmp.name)
        tmp_path = tmp.name

    with open(tmp_path, "r", encoding="utf-8") as f:
        html = f.read()

    os.unlink(tmp_path)

    components.html(html, height=height + 50, scrolling=True)


# ============================================================
# 2. 鱼眼可视化 (D3.js 嵌入式)
# ============================================================

def render_fisheye_graph(
    nodes: List[Dict],
    links: List[Dict],
    node_types: Dict[str, int],
    height: int = 650,
):
    """使用 D3.js 渲染鱼眼扭曲视图 - 鼠标附近节点放大，远处缩小"""

    types_list = sorted(node_types.keys())
    colors = _generate_colors(len(types_list))
    color_map = dict(zip(types_list, colors))

    # 构建图数据
    graph_nodes = []
    for node in nodes:
        graph_nodes.append({
            "id": str(node.get("id", "")),
            "type": node.get("type", "Unknown"),
            "text": (node.get("text", "") or "")[:200],
            "color": color_map.get(node.get("type", "Unknown"), "#888888"),
            "count": node_types.get(node.get("type", "Unknown"), 0),
        })

    node_id_to_index = {gn["id"]: i for i, gn in enumerate(graph_nodes)}

    graph_links = []
    for link in links:
        src = str(link.get("source", ""))
        tgt = str(link.get("target", ""))
        if src in node_id_to_index and tgt in node_id_to_index:
            graph_links.append({
                "source": node_id_to_index[src],
                "target": node_id_to_index[tgt],
                "type": link.get("type", "UNKNOWN"),
            })

    nodes_json = json.dumps(graph_nodes, ensure_ascii=False)
    links_json = json.dumps(graph_links, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    #fisheye-container {{
        width: 100%;
        height: {height}px;
        background: #1a1a2e;
        border-radius: 8px;
        overflow: hidden;
        cursor: crosshair;
    }}
    #fisheye-svg {{
        width: 100%;
        height: 100%;
    }}
    .node-label {{
        font-size: 9px;
        fill: #ccc;
        pointer-events: none;
        text-anchor: middle;
    }}
    .legend {{
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        padding: 8px 12px;
        border-radius: 6px;
        color: #ccc;
        font-size: 11px;
        font-family: Arial, sans-serif;
        max-height: 60%;
        overflow-y: auto;
    }}
    .legend-item {{
        display: flex;
        align-items: center;
        margin: 2px 0;
    }}
    .legend-dot {{
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-right: 6px;
        flex-shrink: 0;
    }}
    .tooltip-fisheye {{
        position: absolute;
        background: rgba(0,0,0,0.85);
        color: #eee;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        pointer-events: none;
        max-width: 280px;
        z-index: 10;
        border: 1px solid rgba(255,255,255,0.2);
    }}
</style>
</head>
<body>
<div id="fisheye-container">
    <div class="legend" id="legend"></div>
    <div class="tooltip-fisheye" id="tooltip" style="display:none;"></div>
</div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
(function() {{
    const container = d3.select("#fisheye-container");
    const width = container.node().getBoundingClientRect().width;
    const height = {height};

    const svg = container.append("svg")
        .attr("id", "fisheye-svg")
        .attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");

    // 图例
    const nodesData = {nodes_json};
    const linksData = {links_json};

    const typeSet = [...new Set(nodesData.map(n => n.type))];
    const legendHtml = typeSet.map(t => {{
        const c = nodesData.find(n => n.type === t).color;
        return `<div class="legend-item"><span class="legend-dot" style="background:${{c}}"></span>${{t}}</div>`;
    }}).join("");
    document.getElementById("legend").innerHTML = legendHtml;

    // 力仿真
    const simulation = d3.forceSimulation(nodesData)
        .force("link", d3.forceLink(linksData).id(d => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(15));

    // 鱼眼变换函数
    function fisheyeTransform(d, mouseX, mouseY, radius) {{
        const dx = d.x - mouseX;
        const dy = d.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) return {{ x: d.x, y: d.y, scale: 2.5 }};

        // 在鱼眼半径内的点向外推，半径外向内压缩
        let newDist;
        if (dist < radius) {{
            // 放大区域：使用平方根映射使近处放大
            newDist = radius * Math.sqrt(dist / radius);
        }} else {{
            // 压缩区域
            const compression = 0.5;
            newDist = radius + (dist - radius) * compression;
        }}

        const ratio = newDist / dist;
        const scale = dist < radius
            ? 2.5 * (1 - dist / radius) + 0.3
            : 0.3;

        return {{
            x: mouseX + dx * ratio,
            y: mouseY + dy * ratio,
            scale: Math.max(0.3, scale)
        }};
    }}

    let fisheyeCenter = {{ x: width / 2, y: height / 2 }};
    let fisheyeRadius = 180;
    let mouseActive = false;

    // 绘制边
    const linkGroup = g.append("g").attr("class", "links");
    let linkElements = linkGroup.selectAll("line")
        .data(linksData)
        .join("line")
        .attr("stroke", "#555")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 0.8);

    // 绘制节点组
    const nodeGroup = g.append("g").attr("class", "nodes");
    let nodeElements = nodeGroup.selectAll("g")
        .data(nodesData)
        .join("g")
        .attr("cursor", "pointer");

    let circles = nodeElements.append("circle")
        .attr("r", d => 4 + Math.sqrt(d.count || 1) * 2)
        .attr("fill", d => d.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .attr("stroke-opacity", 0.3);

    let labels = nodeElements.append("text")
        .attr("class", "node-label")
        .attr("dy", d => -7 - Math.sqrt(d.count || 1) * 1.5)
        .text(d => d.id.substring(0, 10));

    // 鼠标交互
    const tooltip = d3.select("#tooltip");

    container.on("mousemove", function(event) {{
        const rect = container.node().getBoundingClientRect();
        mouseActive = true;
        fisheyeCenter = {{
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        }};

        // 检查是否有节点靠近鼠标
        const nearNode = nodesData.find(d => {{
            const dx = d.x - fisheyeCenter.x;
            const dy = d.y - fisheyeCenter.y;
            return Math.sqrt(dx*dx + dy*dy) < 30;
        }});

        if (nearNode) {{
            tooltip
                .style("display", "block")
                .style("left", (event.clientX - rect.left + 15) + "px")
                .style("top", (event.clientY - rect.top - 20) + "px")
                .html(`<b>${{nearNode.type}}</b><br>${{nearNode.text.substring(0, 180)}}`);
        }} else {{
            tooltip.style("display", "none");
        }}
    }});

    container.on("mouseleave", function() {{
        mouseActive = false;
        fisheyeCenter = {{ x: width / 2, y: height / 2 }};
        tooltip.style("display", "none");
    }});

    container.on("wheel", function(event) {{
        event.preventDefault();
        fisheyeRadius = Math.max(40, Math.min(350, fisheyeRadius - event.deltaY * 0.3));
    }});

    // 每帧更新鱼眼变换
    simulation.on("tick", function() {{
        linkElements
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        nodeElements.each(function(d) {{
            const t = mouseActive
                ? fisheyeTransform(d, fisheyeCenter.x, fisheyeCenter.y, fisheyeRadius)
                : {{ x: d.x, y: d.y, scale: 1.0 }};

            d3.select(this).select("circle")
                .attr("cx", t.x)
                .attr("cy", t.y)
                .attr("r", (4 + Math.sqrt(d.count || 1) * 2) * t.scale);

            d3.select(this).select("text")
                .attr("x", t.x)
                .attr("y", t.y)
                .attr("dy", -7 * t.scale - Math.sqrt(d.count || 1) * 1.5 * t.scale)
                .style("font-size", (9 * t.scale) + "px")
                .style("opacity", t.scale < 0.5 ? 0 : Math.min(1, t.scale));
        }});
    }});
}})();
</script>
</body>
</html>"""

    components.html(html, height=height + 30, scrolling=False)


# ============================================================
# 3. 三维视图 (Plotly 3D Scatter)
# ============================================================

def render_3d_graph(
    nodes: List[Dict],
    links: List[Dict],
    node_types: Dict[str, int],
    height: int = 650,
):
    """使用 Plotly Scatter3d 渲染三维网络图，支持旋转/缩放/透视"""

    # 构建 NetworkX 图
    G = nx.Graph()
    for node in nodes:
        nid = str(node.get("id", ""))
        ntype = node.get("type", "Unknown")
        text = node.get("text", nid) if node.get("text") else nid
        G.add_node(nid, type=ntype, text=text)

    for link in links:
        src = str(link.get("source", ""))
        tgt = str(link.get("target", ""))
        if src in G.nodes() and tgt in G.nodes():
            G.add_edge(src, tgt, type=link.get("type", "UNKNOWN"))

    if len(G.nodes()) == 0:
        st.warning("无有效节点可渲染")
        return

    # 3D Spring 布局
    pos = nx.spring_layout(G, dim=3, k=1.8, iterations=60, seed=42)

    # 边
    edge_x, edge_y, edge_z = [], [], []
    for u, v in G.edges():
        x0, y0, z0 = pos[u]
        x1, y1, z1 = pos[v]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])
        edge_z.extend([z0, z1, None])

    edge_trace = go.Scatter3d(
        x=edge_x,
        y=edge_y,
        z=edge_z,
        line=dict(width=0.6, color="#666666"),
        hoverinfo="none",
        mode="lines",
        name="关系",
    )

    # 节点
    types_list = sorted(node_types.keys())
    colors = _generate_colors(len(types_list))
    color_map = dict(zip(types_list, colors))

    node_traces = []
    for ntype in types_list:
        ntype_nodes = [n for n in G.nodes() if G.nodes[n].get("type") == ntype]
        if not ntype_nodes:
            continue

        xs = [pos[n][0] for n in ntype_nodes]
        ys = [pos[n][1] for n in ntype_nodes]
        zs = [pos[n][2] for n in ntype_nodes]

        # 节点大小基于度数
        sizes = [5 + len(list(G.neighbors(n))) * 2 for n in ntype_nodes]

        hover_texts = [
            f"<b>{n[:25]}</b><br>类型: {G.nodes[n].get('type', '?')}<br>"
            f"关联: {len(list(G.neighbors(n)))} 个节点<br>"
            f"{G.nodes[n].get('text', '')[:100]}"
            for n in ntype_nodes
        ]

        node_traces.append(
            go.Scatter3d(
                x=xs,
                y=ys,
                z=zs,
                mode="markers",
                name=f"{ntype} ({len(ntype_nodes)})",
                marker=dict(
                    size=sizes,
                    color=color_map[ntype],
                    line=dict(width=0.5, color="#ffffff"),
                    opacity=0.9,
                ),
                hovertext=hover_texts,
                hoverinfo="text",
                hoverlabel=dict(bgcolor="#222222", font_size=12),
            )
        )

    fig = go.Figure(data=[edge_trace] + node_traces)

    fig.update_layout(
        scene=dict(
            xaxis=dict(
                showticklabels=False,
                showgrid=True,
                gridcolor="rgba(255,255,255,0.05)",
                zeroline=False,
                showbackground=True,
                backgroundcolor="rgba(0,0,0,0)",
            ),
            yaxis=dict(
                showticklabels=False,
                showgrid=True,
                gridcolor="rgba(255,255,255,0.05)",
                zeroline=False,
                showbackground=True,
                backgroundcolor="rgba(0,0,0,0)",
            ),
            zaxis=dict(
                showticklabels=False,
                showgrid=True,
                gridcolor="rgba(255,255,255,0.05)",
                zeroline=False,
                showbackground=True,
                backgroundcolor="rgba(0,0,0,0)",
            ),
            camera=dict(
                eye=dict(x=1.5, y=1.5, z=1.5),
                up=dict(x=0, y=0, z=1),
            ),
            dragmode="orbit",
        ),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        height=height,
        margin=dict(l=0, r=0, t=0, b=0),
        legend=dict(
            x=0.01,
            y=0.99,
            bgcolor="rgba(0,0,0,0.5)",
            bordercolor="rgba(255,255,255,0.2)",
            borderwidth=1,
            font=dict(color="#ccc", size=11),
        ),
        hovermode="closest",
    )

    # 添加控制提示
    fig.add_annotation(
        text="🖱 拖拽旋转 | 滚轮缩放 | 右键平移 | 双击重置",
        xref="paper", yref="paper",
        x=0.5, y=1.02,
        showarrow=False,
        font=dict(size=10, color="#888"),
    )

    st.plotly_chart(fig, use_container_width=True)


# ============================================================
# 4. DocuBurst 文档层级旭日图
# ============================================================

def render_docuburst(
    entity_data: Dict,
    keyword_data: Dict = None,
    height: int = 600,
):
    """渲染 DocuBurst 风格的文档层级旭日图

    展示文档内容的层级结构：
    - 内圈: 实体大类 (军事组织、地理区域等)
    - 中圈: 具体实体
    - 外圈: 关联关键词
    """
    all_nodes = entity_data.get("all_nodes", [])
    node_types = entity_data.get("node_types", [])

    if not all_nodes:
        st.info("暂无实体数据用于生成层级图")
        return

    # 构建层级数据
    sunburst_data = []

    # 根节点
    sunburst_data.append(dict(
        id="root",
        labels="全部文档",
        parent="",
        value=len(all_nodes),
    ))

    # 实体类型分类
    type_set = set()
    for node in all_nodes:
        ntype = node.get("type", "Unknown")
        type_id = f"type_{ntype}"
        type_set.add(type_id)
        sunburst_data.append(dict(
            id=type_id,
            labels=ntype,
            parent="root",
            value=0,
        ))

    # 具体实体
    type_counter = Counter()
    for node in all_nodes:
        ntype = node.get("type", "Unknown")
        type_id = f"type_{ntype}"
        nid = str(node.get("id", ""))
        text = node.get("text", nid)
        entity_label = (text or nid)[:20]
        entity_id = f"entity_{nid}_{ntype}"

        type_counter[type_id] += 1
        sunburst_data.append(dict(
            id=entity_id,
            labels=entity_label,
            parent=type_id,
            value=1,
            hover_text=f"{ntype}: {(text or nid)[:100]}",
        ))

    # 更新类型节点的值
    for item in sunburst_data:
        if item["id"] in type_set:
            item["value"] = type_counter.get(item["id"], 0)

    import pandas as pd
    df = pd.DataFrame(sunburst_data)

    fig = go.Figure(go.Sunburst(
        ids=df["id"],
        labels=df["labels"],
        parents=df["parent"],
        values=df["value"],
        branchvalues="total",
        textinfo="label+percent parent",
        textfont=dict(size=12, color="white"),
        marker=dict(
            colors=[
                "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
                "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
                "#aec7e8", "#ffbb78", "#98df8a",
            ],
            line=dict(color="rgba(0,0,0,0.3)", width=1),
        ),
        hovertemplate=(
            "<b>%{label}</b><br>"
            "数量: %{value}<br>"
            "占父级: %{percentParent:.1%}<br>"
            "%{customdata}<extra></extra>"
        ),
        customdata=df.get("hover_text", ""),
        maxdepth=3,
    ))

    fig.update_layout(
        title=dict(
            text="文档内容层级结构 (DocuBurst)",
            font=dict(size=16, color="#aaa"),
        ),
        height=height,
        margin=dict(l=10, r=10, t=50, b=10),
        paper_bgcolor="rgba(0,0,0,0)",
    )

    st.plotly_chart(fig, use_container_width=True, key="docuburst")


# ============================================================
# 5. 关键词共现网络
# ============================================================

def render_keyword_network(
    keyword_data: Dict,
    docs_texts: List[str] = None,
    height: int = 600,
):
    """渲染关键词共现交互网络

    基于关键词在文档中的共现关系构建网络：
    - 节点: 关键词，大小 = TF-IDF 得分
    - 边: 共现关系，粗细 = 共现频率
    - 支持拖拽、缩放、hover
    """
    keywords = keyword_data.get("keywords", [])

    if not keywords or len(keywords) < 3:
        st.info("关键词数量不足 (需 >=3)，无法构建共现网络")
        return

    # 取前30个关键词构建网络
    top_keywords = keywords[:30]
    kw_terms = {k["term"] for k in top_keywords}
    kw_scores = {k["term"]: k["score"] for k in top_keywords}

    # 计算共现矩阵
    cooccur = Counter()
    if docs_texts:
        for text in docs_texts:
            if not text:
                continue
            text_lower = str(text).lower()
            present = [term for term in kw_terms if term.lower() in text_lower]
            for i in range(len(present)):
                for j in range(i + 1, len(present)):
                    pair = tuple(sorted([present[i], present[j]]))
                    cooccur[pair] += 1
    else:
        # fallback: 无文本时显示仅节点
        pass

    # 生成颜色
    max_score = max(kw_scores.values()) if kw_scores else 1
    node_colors = {}
    for term, score in kw_scores.items():
        intensity = int(80 + (score / max_score) * 175)
        node_colors[term] = f"rgb({intensity}, 100, {255 - intensity // 2})"

    from pyvis.network import Network

    net = Network(
        height=f"{height}px",
        width="100%",
        bgcolor="#1a1a2e",
        font_color="#e0e0e0",
    )

    # 添加节点
    for kw in top_keywords:
        term = kw["term"]
        score = kw["score"]
        node_size = 8 + (score / max_score) * 35

        net.add_node(
            term,
            label=term,
            title=f"<b>{term}</b><br>TF-IDF: {score:.4f}<br>关联词数: {sum(1 for (a, b) in cooccur if a == term or b == term)}",
            color=node_colors.get(term, "#888888"),
            size=node_size,
            borderWidth=1,
            shape="dot",
        )

    # 添加边 (取前50条最强共现)
    for (a, b), count in cooccur.most_common(50):
        if a in net.node_ids and b in net.node_ids:
            width = 1 + (count / max(c for _, c in cooccur.most_common(1) or [(None, 1)])) * 4
            net.add_edge(
                a, b,
                title=f"共现 {count} 次",
                color={"color": "rgba(150,150,220,0.5)", "opacity": 0.5},
                width=width,
                smooth={"type": "continuous"},
            )

    physics_config = {
        "physics": {
            "barnesHut": {
                "gravitationalConstant": -3000,
                "centralGravity": 0.2,
                "springLength": 150,
                "springConstant": 0.03,
                "damping": 0.09,
            },
            "maxVelocity": 40,
            "minVelocity": 0.75,
            "stabilization": {"iterations": 200},
            "solver": "barnesHut",
        },
        "interaction": {
            "dragNodes": True,
            "dragView": True,
            "zoomView": True,
            "hover": True,
            "hoverConnectedEdges": True,
            "navigationButtons": True,
            "keyboard": {"enabled": True},
            "tooltipDelay": 150,
        },
        "edges": {
            "smooth": {"type": "continuous", "forceDirection": "none"},
        },
        "nodes": {
            "font": {"size": 11, "face": "Arial", "strokeWidth": 0},
        },
    }

    net.set_options(json.dumps(physics_config))

    with tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w", encoding="utf-8") as tmp:
        net.save_graph(tmp.name)
        tmp_path = tmp.name

    with open(tmp_path, "r", encoding="utf-8") as f:
        html = f.read()

    os.unlink(tmp_path)

    components.html(html, height=height + 50, scrolling=True)

    # 统计信息
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("关键词节点", len(top_keywords))
    with col2:
        st.metric("共现边数", len(cooccur))
    with col3:
        st.metric("最强共现", f"{cooccur.most_common(1)[0][1]}次" if cooccur else "N/A")