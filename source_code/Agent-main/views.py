"""
6视图可视化模块 - 态势总览、事件时间线、知识图谱、空间态势、来源对比、证据问答
"""

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import streamlit as st
import numpy as np
import pandas as pd
from collections import Counter
from typing import Dict, Any, List
import logging
from datetime import datetime

logger = logging.getLogger('graphy')

from advanced_viz import (
    render_fisheye_graph,
    render_3d_graph,
    render_force_directed_graph,
    render_docuburst,
    render_keyword_network,
)

# ============================================================
# 通用工具
# ============================================================

def _generate_colors(n: int) -> List[str]:
    """生成n种不同颜色"""
    import colorsys
    return [f'rgb({int(r*255)},{int(g*255)},{int(b*255)})'
            for r, g, b in [colorsys.hsv_to_rgb(i/n, 0.7, 0.9) for i in range(n)]]


# ============================================================
# 视图1: 态势总览
# ============================================================

def render_overview(analysis_result: Dict[str, Any]):
    """渲染态势总览视图"""
    st.header("态势总览")

    stats = analysis_result.get("stats", {})
    meta = stats.get("meta", {})
    stat_data = stats.get("stats", {})
    entity_data = analysis_result.get("entity_data", {})
    spatial_data = analysis_result.get("spatial_data", {})

    # --- KPI 卡片行 ---
    person_data = analysis_result.get("person_data", {})
    col1, col2, col3, col4, col5, col6 = st.columns(6)
    with col1:
        st.metric("文本块数", meta.get("total_chunks", 0))
    with col2:
        st.metric("识别实体", meta.get("total_entities", 0))
    with col3:
        st.metric("发现关系", meta.get("total_relations", 0))
    with col4:
        st.metric("识别人物", person_data.get("total_persons", 0))
    with col5:
        st.metric("地理位置", spatial_data.get("total_locations", 0))
    with col6:
        st.metric("总字符数", f"{stat_data.get('total_chars', 0):,}")

    st.divider()

    # --- 图表区域 ---
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("实体类型分布")
        entity_dist = stats.get("entity_distribution", {})
        if entity_dist:
            fig = px.pie(
                values=list(entity_dist.values()),
                names=list(entity_dist.keys()),
                title="实体类型占比",
                hole=0.3,
            )
            fig.update_traces(textposition='inside', textinfo='percent+label')
            fig.update_layout(height=350, margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("暂无实体数据")

    with col_right:
        st.subheader("关系类型分布")
        rel_dist = stats.get("relation_distribution", {})
        if rel_dist:
            fig = px.bar(
                x=list(rel_dist.keys()),
                y=list(rel_dist.values()),
                title="关系类型统计",
                labels={"x": "关系类型", "y": "数量"},
            )
            fig.update_layout(height=350, margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("暂无关系数据")

    # --- DocuBurst 文档层级旭日图 ---
    with st.expander("文档内容层级结构 (DocuBurst)", expanded=True):
        render_docuburst(
            entity_data=entity_data,
            keyword_data=analysis_result.get("keyword_data"),
        )

    # --- 关键词与主题分析 ---
    keyword_data = analysis_result.get("keyword_data", {})
    keywords = keyword_data.get("keywords", [])
    cat_dist = keyword_data.get("category_distribution", {})

    if keywords or cat_dist:
        st.divider()
        col_kw, col_cat = st.columns(2)

        with col_kw:
            st.subheader("文档关键词 (TF-IDF)")
            if keywords:
                fig = px.bar(
                    x=[k["score"] for k in keywords[:15]],
                    y=[k["term"] for k in keywords[:15]],
                    orientation='h',
                    title="TF-IDF 权重排名",
                    labels={"x": "权重", "y": "关键词"},
                )
                fig.update_layout(yaxis={'categoryorder': 'total ascending'}, height=380)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("暂无关键词数据")

        with col_cat:
            st.subheader("事件类别分布")
            if cat_dist:
                fig = px.pie(
                    values=list(cat_dist.values()),
                    names=list(cat_dist.keys()),
                    title="文档中的事件类型占比",
                    hole=0.35,
                )
                fig.update_traces(textposition='inside', textinfo='percent+label')
                fig.update_layout(height=380)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("暂无事件分类数据")

        # 关键词共现网络
        with st.expander("关键词共现网络 (交互式)", expanded=False):
            st.caption("节点大小 = TF-IDF 权重, 连线 = 在同一段落中共现")
            render_keyword_network(
                keyword_data,
                docs_texts=analysis_result.get("docs_texts"),
            )

    # --- 人物列表 ---
    person_data = analysis_result.get("person_data", {})
    person_list = person_data.get("person_list", [])
    if person_list:
        st.subheader("识别的人物名称")
        import pandas as pd
        df_persons = pd.DataFrame(person_list)
        df_persons.index = range(1, len(df_persons) + 1)
        df_persons.index.name = "排名"
        st.dataframe(
            df_persons[["name", "count", "title", "context"]].rename(
                columns={"name": "姓名", "count": "提及次数", "title": "头衔", "context": "上下文"}
            ),
            use_container_width=True,
            height=250,
        )

    # --- 自动洞察 ---
    st.subheader("自动洞察")
    if "insights" in analysis_result:
        for insight in analysis_result["insights"]:
            st.markdown(f"- {insight}")
    else:
        st.info("分析完成后将自动生成洞察")

    # --- 处理管线可视化 ---
    st.divider()
    st.subheader("数据处理管线")
    pipeline_steps = [
        ("文档加载", meta.get("total_chunks", 0), "chunks"),
        ("关键词分析", len(keywords), "words"),
        ("人物识别", person_data.get("total_persons", 0), "persons"),
        ("图谱构建", f"{meta.get('total_entities', 0)}实体/{meta.get('total_relations', 0)}关系", "graph"),
        ("时间线", f"{meta.get('timeline_events', 0)}事件/{len(analysis_result.get('timeline', []))}节点", "events"),
        ("空间提取", spatial_data.get("total_locations", 0), "locations"),
    ]
    cols = st.columns(len(pipeline_steps))
    for col, (name, value, _) in zip(cols, pipeline_steps):
        with col:
            st.metric(name, value)


# ============================================================
# 视图2: 事件时间线
# ============================================================

def render_timeline(analysis_result: Dict[str, Any]):
    """渲染事件时间线视图"""
    st.header("事件时间线")

    timeline = analysis_result.get("timeline", [])

    if not timeline:
        st.info("暂无时间线数据。请上传包含日期信息的文档。")
        return

    # --- 时间线总览统计 ---
    total_events = sum(day.get("count", 0) for day in timeline)
    all_categories = set()
    for day in timeline:
        all_categories.update(day.get("categories", []))

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("时间节点数", len(timeline))
    with col2:
        st.metric("总事件数", total_events)
    with col3:
        st.metric("事件类别数", len(all_categories))

    st.divider()

    # --- 时间线图表 ---
    st.subheader("事件时间线图")

    # 准备甘特图数据
    gantt_data = []
    for day in timeline:
        date_str = day["date"]
        for event in day.get("events", []):
            gantt_data.append({
                "日期": date_str,
                "类别": event.get("category", "其他"),
                "摘要": event.get("summary", "")[:80],
            })

    if gantt_data:
        df = pd.DataFrame(gantt_data)
        # 按日期和类别分组计数
        df_pivot = df.groupby(["日期", "类别"]).size().reset_index(name="count")

        fig = px.scatter(
            df_pivot,
            x="日期",
            y="类别",
            size="count",
            color="类别",
            hover_data=["count"],
            title="事件时间线分布",
            size_max=30,
        )
        fig.update_layout(
            height=400,
            margin=dict(l=10, r=10, t=40, b=10),
            xaxis=dict(tickangle=-45),
        )
        st.plotly_chart(fig, use_container_width=True)

    # --- 详细事件列表 ---
    st.subheader("事件详情")

    # 按类别筛选
    categories = ["全部"] + sorted(all_categories)
    selected_category = st.selectbox("按事件类别筛选", categories)

    # 获取上下文数据用于细粒度分析
    entity_data = analysis_result.get("entity_data", {})
    person_data = analysis_result.get("person_data", {})
    spatial_data = analysis_result.get("spatial_data", {})
    all_nodes = entity_data.get("all_nodes", [])
    person_list = person_data.get("person_list", [])
    locations = spatial_data.get("locations", [])

    # 判断是否需要细粒度展示（事件较少时）
    is_sparse = len(timeline) <= 3 and total_events <= 10

    for day in reversed(timeline):
        day_events = day.get("events", [])
        if selected_category != "全部":
            day_events = [e for e in day_events if e.get("category") == selected_category]

        if not day_events:
            continue

        event_count = len(day_events)
        expander_label = f"**{day['date']}** — {event_count} 个事件"
        with st.expander(expander_label, expanded=is_sparse):
            for event in day_events:
                cat = event.get("category", "其他")
                summary = event.get("summary", "")

                if is_sparse:
                    # 细粒度：展开完整摘要 + 关联分析
                    st.markdown(f"### [{cat}] 事件")
                    st.markdown(summary[:600] if len(summary) > 600 else summary)
                    st.divider()

                    # 关联实体
                    if all_nodes:
                        summary_lower = summary.lower()
                        related = [
                            n for n in all_nodes
                            if n.get("text") and any(
                                w in (n.get("text") or "").lower()
                                for w in summary_lower.split()[:20] if len(w) >= 2
                            )
                        ][:5]
                        if related:
                            st.caption("关联实体:")
                            for rn in related:
                                st.markdown(
                                    f"- **{rn.get('type', '?')}**: {rn.get('text', '')[:80]}"
                                )

                    # 关联人物
                    if person_list:
                        person_names = {p["name"].lower() for p in person_list}
                        found_persons = [
                            pn for pn in person_names
                            if pn.lower() in summary.lower()
                        ]
                        if found_persons:
                            st.caption(f"涉及人物: {', '.join(found_persons)}")

                    # 关联地点
                    if locations:
                        loc_names = {l["name"] for l in locations}
                        found_locs = [
                            ln for ln in loc_names
                            if ln in summary
                        ]
                        if found_locs:
                            st.caption(f"涉及地点: {', '.join(found_locs)}")
                else:
                    # 正常模式：摘要截断
                    st.markdown(f"- **[{cat}]** {summary[:200]}...")


# ============================================================
# 视图3: 知识图谱
# ============================================================

def render_knowledge_graph(graph_data: Dict, entity_data: Dict = None):
    """渲染知识图谱视图 - 增强版，支持类型筛选和交互"""
    st.header("知识图谱")

    if not graph_data or not graph_data.get("nodes"):
        st.info("暂无图谱数据。请先上传并处理文档。")
        return

    nodes = graph_data.get("nodes", [])
    links = graph_data.get("links", [])

    # --- 图谱统计 ---
    node_types = {}
    for node in nodes:
        ntype = node.get("type", "Unknown")
        node_types[ntype] = node_types.get(ntype, 0) + 1

    rel_types = {}
    for link in links:
        rtype = link.get("type", "UNKNOWN")
        rel_types[rtype] = rel_types.get(rtype, 0) + 1

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("节点总数", len(nodes))
    with col2:
        st.metric("关系总数", len(links))
    with col3:
        st.metric("实体类型数", len(node_types))

    st.divider()

    # --- 类型筛选 ---
    all_types = sorted(node_types.keys())
    selected_types = st.multiselect(
        "筛选实体类型 (留空显示全部)",
        all_types,
        default=all_types[:5] if len(all_types) > 5 else all_types,
    )

    # --- 图谱可视化 (节点筛选) ---
    filtered_nodes = nodes
    if selected_types:
        filtered_nodes = [n for n in nodes if n.get("type") in selected_types]
        filtered_ids = {n["id"] for n in filtered_nodes}
        filtered_links = [
            l for l in links
            if l.get("source") in filtered_ids and l.get("target") in filtered_ids
        ]
    else:
        filtered_links = links

    if not filtered_nodes:
        st.warning("筛选条件下无节点")
        return

    # --- 可视化模式子标签页 ---
    viz_tabs = st.tabs(["标准视图", "力导向", "鱼眼视图", "三维视图"])

    # 共享图例
    legend_html = ""
    st.caption("图例说明")
    cols = st.columns(min(len(node_types), 6))
    type_colors = _generate_colors(len(node_types))
    for i, (ntype, count) in enumerate(sorted(node_types.items())):
        with cols[i % len(cols)]:
            st.markdown(
                f"<span style='color:{type_colors[i]};font-size:20px;'>●</span> {ntype} ({count})",
                unsafe_allow_html=True,
            )

    # 子视图1: 标准2D网络图
    with viz_tabs[0]:
        fig = _create_graph_figure(filtered_nodes, filtered_links, node_types)
        st.plotly_chart(fig, use_container_width=True, key="knowledge_graph_main")

    # 子视图2: 力导向动画图
    with viz_tabs[1]:
        st.caption("拖拽节点探索关系网络 - 支持缩放、平移、节点拖拽")
        render_force_directed_graph(filtered_nodes, filtered_links, node_types)

    # 子视图3: 鱼眼扭曲视图
    with viz_tabs[2]:
        st.caption("移动鼠标聚焦节点 - 滚轮调整鱼眼半径")
        render_fisheye_graph(filtered_nodes, filtered_links, node_types)

    # 子视图4: 三维立体视图
    with viz_tabs[3]:
        render_3d_graph(filtered_nodes, filtered_links, node_types)

    # --- 节点详情表 ---
    with st.expander("查看所有节点详情"):
        node_table = pd.DataFrame([
            {"ID": n.get("id", "")[:30], "类型": n.get("type", "Unknown"),
             "内容": (n.get("text", "") or "")[:100]}
            for n in filtered_nodes
        ])
        st.dataframe(node_table, use_container_width=True)


def _create_graph_figure(nodes: List[Dict], links: List[Dict], node_types: Dict) -> go.Figure:
    """创建知识图谱可视化图形"""
    import networkx as nx

    G = nx.Graph()
    for node in nodes:
        G.add_node(node["id"], type=node.get("type", "Unknown"), text=node.get("text", ""))

    for link in links:
        G.add_edge(
            str(link["source"]),
            str(link["target"]),
            label=link.get("type", "UNKNOWN"),
        )

    # 使用spring布局
    pos = nx.spring_layout(G, k=1.5, iterations=50, seed=42)

    # 颜色映射
    types_list = list(node_types.keys())
    colors = _generate_colors(len(types_list))
    color_map = dict(zip(types_list, colors))

    # 边
    edge_x, edge_y = [], []
    for src, dst in G.edges():
        x0, y0 = pos[src]
        x1, y1 = pos[dst]
        edge_x.extend([x0, x1, None])
        edge_y.extend([y0, y1, None])

    edge_trace = go.Scatter(
        x=edge_x, y=edge_y,
        line=dict(width=0.5, color="#888"),
        hoverinfo="none",
        mode="lines",
    )

    # 节点
    node_x, node_y = [], []
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)

    node_color = [color_map.get(G.nodes[n].get("type", "Unknown"), "#888") for n in G.nodes()]
    node_text = [
        f"<b>{n[:30]}</b><br>类型: {G.nodes[n].get('type', 'Unknown')}<br>{G.nodes[n].get('text', '')[:80]}"
        for n in G.nodes()
    ]
    node_size = [10 + len(list(G.neighbors(n))) * 3 for n in G.nodes()]

    node_trace = go.Scatter(
        x=node_x, y=node_y,
        mode="markers",
        hoverinfo="text",
        hovertext=node_text,
        marker=dict(
            showscale=False,
            color=node_color,
            size=node_size,
            line_width=1,
        ),
    )

    # 图例
    legend_traces = []
    for ntype, color in color_map.items():
        legend_traces.append(
            go.Scatter(
                x=[None], y=[None],
                mode="markers",
                marker=dict(size=10, color=color),
                name=f"{ntype} ({node_types.get(ntype, 0)})",
            )
        )

    fig = go.Figure(
        data=[edge_trace, node_trace] + legend_traces,
        layout=go.Layout(
            title="实体关系网络",
            showlegend=True,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            height=600,
        ),
    )

    return fig


# ============================================================
# 视图4: 空间态势
# ============================================================

def render_spatial(analysis_result: Dict[str, Any]):
    """渲染空间态势视图 - 使用Plotly地图"""
    st.header("空间态势")

    spatial_data = analysis_result.get("spatial_data", {})
    locations = spatial_data.get("locations", [])

    if not locations:
        st.info("暂无地理位置数据。请上传包含地理信息的文档。")
        return

    # --- 统计 ---
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("发现位置数", len(locations))
    with col2:
        top_loc = spatial_data.get("top_location", {})
        st.metric("最频繁地点", top_loc.get("name", "N/A"))
    with col3:
        st.metric("总提及次数", sum(loc["mention_count"] for loc in locations))

    st.divider()

    # --- 地图可视化 ---
    st.subheader("地理位置分布")

    # 准备地图数据
    lats = [loc["lat"] for loc in locations]
    lngs = [loc["lng"] for loc in locations]
    names = [loc["name"] for loc in locations]
    counts = [loc["mention_count"] for loc in locations]
    contexts = ["<br>".join(loc.get("contexts", [])[:2]) for loc in locations]

    # 气泡大小映射
    max_count = max(counts) if counts else 1
    sizes = [10 + (c / max_count) * 40 for c in counts]

    fig = go.Figure()

    # 添加散点(气泡)
    fig.add_trace(go.Scattergeo(
        lon=lngs,
        lat=lats,
        text=[f"<b>{n}</b><br>提及: {c} 次<br>{ctx[:200]}" for n, c, ctx in zip(names, counts, contexts)],
        mode="markers+text",
        marker=dict(
            size=sizes,
            color=counts,
            colorscale="Reds",
            showscale=True,
            colorbar=dict(title="提及次数"),
            line=dict(width=1, color="white"),
        ),
        textposition="top center",
        textfont=dict(size=10),
    ))

    # 设置地图范围(聚焦中东)
    fig.update_layout(
        geo=dict(
            projection_type="natural earth",
            showland=True,
            landcolor="rgb(243, 243, 243)",
            coastlinecolor="rgb(204, 204, 204)",
            showcountries=True,
            countrycolor="rgb(204, 204, 204)",
            center=dict(lat=28, lon=45),
            projection_scale=3.5,
        ),
        height=550,
        margin=dict(l=10, r=10, t=10, b=10),
    )

    st.plotly_chart(fig, use_container_width=True)

    # --- 位置详情表 ---
    st.subheader("地理位置详情")
    loc_df = pd.DataFrame([
        {"地点": loc["name"], "纬度": f"{loc['lat']:.2f}",
         "经度": f"{loc['lng']:.2f}", "提及次数": loc["mention_count"]}
        for loc in locations
    ])
    st.dataframe(loc_df, use_container_width=True, hide_index=True)

    # --- 提及频次柱状图 ---
    st.subheader("地点提及频次")
    fig_bar = px.bar(
        x=[loc["name"] for loc in locations[:15]],
        y=[loc["mention_count"] for loc in locations[:15]],
        labels={"x": "地点", "y": "提及次数"},
        title="Top 15 地理位置",
    )
    fig_bar.update_layout(height=350, margin=dict(l=10, r=10, t=40, b=10))
    st.plotly_chart(fig_bar, use_container_width=True)


# ============================================================
# 视图5: 来源对比分析
# ============================================================

def render_source_analysis(analysis_result: Dict[str, Any], docs_metadata: List[Dict] = None):
    """渲染来源对比分析视图"""
    st.header("来源分析")

    stats = analysis_result.get("stats", {})
    stat_data = stats.get("stats", {})
    entity_data = analysis_result.get("entity_data", {})

    # 对于单文档上传，展示文档级别的分析
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("文档名称", analysis_result.get("file_name", "N/A")[:20])
    with col2:
        st.metric("文本块数", stats.get("meta", {}).get("total_chunks", 0))
    with col3:
        st.metric("平均块大小", f"{stat_data.get('mean_chunk_size', 0)} 字符")
    with col4:
        st.metric("总字符数", f"{stat_data.get('total_chars', 0):,}")

    st.divider()

    # --- 文本长度分布 ---
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("文本块大小统计")
        text_lengths = stat_data.get("text_lengths", [])
        if text_lengths:
            fig = px.box(
                y=text_lengths,
                title="文本块字符数分布",
                labels={"y": "字符数"},
            )
            fig.update_layout(height=300, margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(fig, use_container_width=True)

    with col_right:
        st.subheader("实体密度分析")
        entity_dist = stats.get("entity_distribution", {})
        if entity_dist:
            fig = px.treemap(
                names=list(entity_dist.keys()),
                values=list(entity_dist.values()),
                title="实体类型树图",
            )
            fig.update_layout(height=300, margin=dict(l=10, r=10, t=40, b=10))
            st.plotly_chart(fig, use_container_width=True)

    # --- 关系网络统计 ---
    st.subheader("关系网络分析")
    rel_dist = stats.get("relation_distribution", {})
    node_types = entity_data.get("node_types", [])

    if rel_dist and node_types:
        col_a, col_b = st.columns(2)
        with col_a:
            # 关系桑基图数据
            edges = analysis_result.get("edges", [])
            if edges:
                source_types = Counter(e.get("source_type", "Unknown") for e in edges)
                target_types = Counter(e.get("target_type", "Unknown") for e in edges)

                sankey_labels = list(set(list(source_types.keys()) + list(target_types.keys())))
                label_to_idx = {l: i for i, l in enumerate(sankey_labels)}

                sankey_source = []
                sankey_target = []
                sankey_value = []

                edge_counter = Counter(
                    (e.get("source_type", "Unknown"), e.get("target_type", "Unknown"))
                    for e in edges
                )

                for (src, tgt), count in edge_counter.most_common(15):
                    sankey_source.append(label_to_idx[src])
                    sankey_target.append(label_to_idx[tgt])
                    sankey_value.append(count)

                fig_sankey = go.Figure(data=[go.Sankey(
                    node=dict(
                        pad=15, thickness=20,
                        line=dict(color="black", width=0.5),
                        label=sankey_labels,
                    ),
                    link=dict(
                        source=sankey_source,
                        target=sankey_target,
                        value=sankey_value,
                    ),
                )])
                fig_sankey.update_layout(
                    title="实体关系流向图",
                    height=400,
                    margin=dict(l=10, r=10, t=40, b=10),
                )
                st.plotly_chart(fig_sankey, use_container_width=True)
            else:
                st.info("暂无关系流向数据")

        with col_b:
            if edges:
                # 实体类型关系热力图
                source_types_list = sorted(set(e.get("source_type", "Unknown") for e in edges))
                target_types_list = sorted(set(e.get("target_type", "Unknown") for e in edges))

                heatmap_data = np.zeros((len(source_types_list), len(target_types_list)))
                for e in edges:
                    si = source_types_list.index(e.get("source_type", "Unknown")) if e.get("source_type", "Unknown") in source_types_list else 0
                    ti = target_types_list.index(e.get("target_type", "Unknown")) if e.get("target_type", "Unknown") in target_types_list else 0
                    heatmap_data[si][ti] += 1

                fig_heat = px.imshow(
                    heatmap_data,
                    x=target_types_list,
                    y=source_types_list,
                    title="实体类型关系热力图",
                    labels={"x": "目标类型", "y": "源类型", "color": "关系数"},
                    aspect="auto",
                )
                fig_heat.update_layout(height=400, margin=dict(l=10, r=10, t=40, b=10))
                st.plotly_chart(fig_heat, use_container_width=True)


# ============================================================
# 视图6: 证据问答 (保留并增强原有Q&A功能)
# ============================================================

def render_evidence_qa(graph, embeddings, llm, analysis_result: Dict[str, Any],
                       process_question_fn=None):
    """渲染证据问答视图 - 增强版GraphRAG"""
    st.header("证据问答")

    st.markdown("基于知识图谱的智能问答，答案可追溯到原文段落。")

    # 初始化聊天历史
    if "qa_messages" not in st.session_state:
        st.session_state.qa_messages = []

    # 显示聊天历史
    for msg in st.session_state.qa_messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            if "sources" in msg and msg["sources"]:
                with st.expander("📎 证据来源"):
                    for src in msg["sources"]:
                        st.caption(f"- {src[:200]}...")

    # 输入区域
    if prompt := st.chat_input("输入问题，系统将从知识图谱中检索证据并回答"):
        st.session_state.qa_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            message_placeholder = st.empty()

            try:
                if process_question_fn:
                    response, results, context = process_question_fn(
                        prompt, graph, {}, embeddings, llm
                    )
                else:
                    response = "问答功能暂不可用(未提供process_question函数)"
                    results, context = None, []

                message_placeholder.markdown(response)

                # 显示检索到的证据
                if context:
                    with st.expander("📎 检索证据 (点击展开)"):
                        for i, ctx in enumerate(context, 1):
                            st.markdown(f"**证据 {i}:** {ctx[:300]}...")
                            st.divider()

                st.session_state.qa_messages.append({
                    "role": "assistant",
                    "content": response,
                    "sources": context if context else [],
                })

            except Exception as e:
                error_msg = f"问答出错: {str(e)}"
                message_placeholder.error(error_msg)
                st.session_state.qa_messages.append({"role": "assistant", "content": error_msg})


# ============================================================
# 全局导航
# ============================================================

def render_all_views(analysis_result: Dict[str, Any], graph=None,
                     embeddings=None, llm=None, graph_data: Dict = None,
                     process_question_fn=None):
    """渲染所有6个视图，使用标签页导航"""

    tabs = st.tabs([
        "态势总览",
        "事件时间线",
        "知识图谱",
        "空间态势",
        "来源分析",
        "证据问答",
    ])

    with tabs[0]:
        render_overview(analysis_result)

    with tabs[1]:
        render_timeline(analysis_result)

    with tabs[2]:
        # 优先使用graph_data，如果没有则从分析结果中提取
        gd = graph_data or analysis_result.get("graph_data", {})
        ed = analysis_result.get("entity_data", {})
        render_knowledge_graph(gd, ed)

    with tabs[3]:
        render_spatial(analysis_result)

    with tabs[4]:
        render_source_analysis(analysis_result)

    with tabs[5]:
        render_evidence_qa(graph, embeddings, llm, analysis_result, process_question_fn)
