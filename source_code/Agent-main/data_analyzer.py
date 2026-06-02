"""
数据清洗与分析模块 - 从Neo4j知识图谱和文本中提取结构化数据
用于支持6视图可视化：态势总览、事件时间线、知识图谱、空间态势、来源对比、证据问答
"""

import re
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import Counter
import numpy as np
import jieba.posseg as pseg
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document

logger = logging.getLogger('graphy')

# 中文常见姓氏（覆盖绝大多数）
CN_SURNAMES = set("""
赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张
孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎
鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤
滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟平黄
和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞
熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭
梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫
经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚
程嵇邢滑裴陆荣翁荀羊於惠甄麴家封芮羿储靳汲邴糜松
井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫
宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄
印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双
闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通
边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容
向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东
欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空
曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逮盍益桓公
万俟司马上官欧阳夏侯诸葛闻人东方赫连皇甫尉迟公羊
澹台公冶宗政濮阳淳于单于太叔申屠公孙仲孙轩辕令狐
钟离宇文长孙慕容鲜于闾丘司徒司空丌官司寇仉督子车
颛孙端木巫马公西漆雕乐正壤驷公良拓跋夹谷宰父谷梁
""".replace('\n', ''))

# 中文姓名正则：常见姓 + 1~2个汉字名
CN_NAME_RE = re.compile(r'[%s][\u4e00-\u9fa5]{1,2}(?=\s|[，。；！？、：""（）《》\n]|$)' % ''.join(CN_SURNAMES))

# 英文人名正则：需要前面有头衔/动作词，或跟在逗号后（如 "said John Smith"）
EN_NAME_RE = re.compile(
    r'(?:(?:President|General|Minister|Secretary|Commander|Admiral|Colonel|Major|Captain|'
    r'Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Ambassador|King|Prince|said|stated|reported|told|'
    r'[，。；！？、：""（）])\s+)'
    r'([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})'
    r'(?=\s|[,.]|$)'
)

# 军事/政治头衔过滤词
TITLE_WORDS = {'总统', '总理', '司令', '部长', '将军', '上校', '中校', '少校', '上尉', '中尉', '少尉',
               '领导', '发言人', '代表', '主席', '秘书长', '指挥官', '军官', '大使', '外长', '防长',
               'President', 'General', 'Minister', 'Secretary', 'Commander', 'Admiral'}

# 英文常见非人名单词（句首大写词）
EN_STOP_WORDS = {
    'However', 'The', 'This', 'That', 'These', 'Those', 'They', 'Their', 'There',
    'Figure', 'Table', 'Chapter', 'Section', 'Page', 'But', 'And', 'For', 'With',
    'From', 'After', 'Before', 'During', 'While', 'Although', 'Because', 'Since',
    'According', 'Despite', 'Furthermore', 'Moreover', 'Nevertheless', 'Therefore',
    'Meanwhile', 'Currently', 'Recently', 'Previously', 'Finally', 'Additionally',
    'It', 'Its', 'He', 'She', 'We', 'You', 'Which', 'What', 'When', 'Where',
    'Why', 'How', 'Not', 'Also', 'Only', 'Just', 'Still', 'Then', 'Now',
    'Western', 'Eastern', 'Northern', 'Southern', 'Islamic', 'Middle',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'United', 'European', 'Russian', 'Chinese', 'American', 'Iranian',
}

def extract_keyword_analysis(docs: List[Document], top_n: int = 30) -> Dict[str, Any]:
    """TF-IDF 关键词分析 - 提取文档中最具区分度的术语"""
    from sklearn.feature_extraction.text import TfidfVectorizer

    texts = [doc.page_content for doc in docs if hasattr(doc, 'page_content')]
    if not texts:
        return {"keywords": [], "categories": {}}

    # TF-IDF 提取关键词
    try:
        vectorizer = TfidfVectorizer(
            max_features=top_n,
            ngram_range=(1, 2),
            stop_words='english',
        )
        tfidf_matrix = vectorizer.fit_transform(texts)
        feature_names = vectorizer.get_feature_names_out()
        scores = tfidf_matrix.sum(axis=0).A1
        ranked = sorted(zip(feature_names, scores), key=lambda x: x[1], reverse=True)

        keywords = [
            {"term": term, "score": round(float(score), 4)}
            for term, score in ranked[:top_n]
        ]
    except Exception:
        # fallback: jieba 关键词提取
        import jieba.analyse
        full_text = ' '.join(texts)
        jieba_keywords = jieba.analyse.extract_tags(full_text, topK=top_n, withWeight=True)
        keywords = [
            {"term": term, "score": round(float(weight), 4)}
            for term, weight in jieba_keywords
        ]

    # 事件类型分类统计（跨所有 chunks）
    category_counts = Counter()
    for doc in docs:
        text = doc.page_content if hasattr(doc, 'page_content') else str(doc)
        cats = categorize_event(text)
        for c in cats:
            category_counts[c] += 1

    return {
        "keywords": keywords,
        "category_distribution": dict(category_counts.most_common()),
    }


def extract_entities_from_neo4j(graph) -> Dict[str, Any]:
    """从Neo4j图谱中提取实体类型分布和关系统计"""
    try:
        # 查询节点类型分布
        node_type_query = """
        MATCH (n)
        WHERE NOT n:Document
        WITH labels(n) AS labels
        UNWIND labels AS label
        RETURN label, count(*) AS count
        ORDER BY count DESC
        """
        node_types = graph.query(node_type_query)

        # 查询关系类型分布
        rel_type_query = """
        MATCH ()-[r]->()
        RETURN type(r) AS type, count(*) AS count
        ORDER BY count DESC
        """
        rel_types = graph.query(rel_type_query)

        # 查询所有节点(含属性)
        all_nodes_query = """
        MATCH (n)
        WHERE NOT n:Document
        RETURN labels(n)[0] AS type, n.id AS id, n.text AS text
        LIMIT 500
        """
        all_nodes = graph.query(all_nodes_query)

        return {
            "node_types": node_types,
            "rel_types": rel_types,
            "all_nodes": all_nodes,
            "total_nodes": sum(item['count'] for item in node_types),
            "total_rels": sum(item['count'] for item in rel_types),
        }
    except Exception as e:
        logger.error(f"提取实体失败: {e}")
        return {"node_types": [], "rel_types": [], "all_nodes": [], "total_nodes": 0, "total_rels": 0}


def extract_graph_edges(graph) -> List[Dict]:
    """提取图谱的边关系"""
    try:
        edges_query = """
        MATCH (n)-[r]->(m)
        WHERE NOT n:Document AND NOT m:Document
        RETURN labels(n)[0] AS source_type, n.id AS source_id, n.text AS source_text,
               type(r) AS relation,
               labels(m)[0] AS target_type, m.id AS target_id, m.text AS target_text
        LIMIT 500
        """
        return graph.query(edges_query)
    except Exception as e:
        logger.error(f"提取边关系失败: {e}")
        return []


# ============================================================
# 2. 时间线提取
# ============================================================

# 常见日期模式
DATE_PATTERNS = [
    (r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?', '%Y-%m-%d'),  # 2026-04-23 或 2026年4月23日
    (r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})', '%d %B %Y'),
    (r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})', '%B %d %Y'),
    (r'(\d{1,2})/(\d{1,2})/(\d{4})', '%m/%d/%Y'),
]

# 事件关键词分类
EVENT_CATEGORIES = {
    "空袭/轰炸": ["空袭", "轰炸", "打击", "袭击", "导弹", "airstrike", "strike", "bomb", "attack", "shelling"],
    "停火/谈判": ["停火", "休战", "谈判", "协议", "和平", "ceasefire", "truce", "negotiation", "peace", "deal"],
    "封锁/航运": ["封锁", "海峡", "港口", "航运", "blockade", "strait", "Hormuz", "shipping", "port"],
    "外交声明": ["声明", "言论", "警告", "宣布", "呼吁", "谴责", "statement", "declare", "warn", "urge", "condemn"],
    "军事行动": ["军事", "部队", "部署", "军队", "military", "troop", "deploy", "force", "navy", "naval"],
    "人道主义": ["平民", "伤亡", "难民", "人道", "医院", "civilian", "casualty", "refugee", "humanitarian", "hospital"],
    "经济影响": ["经济", "石油", "制裁", "金融", "油价", "economic", "oil", "sanction", "financial"],
}


def extract_dates_from_text(text: str) -> List[str]:
    """从文本中提取日期"""
    dates = []
    for pattern, _ in DATE_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            try:
                if len(match) == 3:
                    if match[0].isdigit() and len(match[0]) == 4:  # YYYY-MM-DD
                        date_str = f"{match[0]}-{match[1].zfill(2)}-{match[2].zfill(2)}"
                    elif match[2].isdigit() and len(match[2]) == 4:  # DD Month YYYY or Month DD YYYY
                        date_str = f"{match[2]}-{match[1].zfill(2)}-{match[0].zfill(2)}"
                    else:
                        continue
                    dates.append(date_str)
            except (ValueError, IndexError):
                continue
    return list(set(dates))


def categorize_event(text: str) -> List[str]:
    """根据文本内容对事件进行分类"""
    text_lower = text.lower()
    categories = []
    for category, keywords in EVENT_CATEGORIES.items():
        if any(kw.lower() in text_lower for kw in keywords):
            categories.append(category)
    return categories if categories else ["其他"]


def extract_timeline_from_chunks(chunks: List[Document], llm: ChatOpenAI = None) -> List[Dict]:
    """从文本块中提取事件时间线"""
    timeline_events = []

    for chunk in chunks:
        text = chunk.page_content if hasattr(chunk, 'page_content') else str(chunk)
        dates = extract_dates_from_text(text)

        if dates:
            categories = categorize_event(text)
            # 取文本的前200字符作为事件摘要
            summary = text[:200].replace('\n', ' ').strip()
            for date in dates:
                timeline_events.append({
                    "date": date,
                    "summary": summary,
                    "categories": categories,
                    "source": "document"
                })

    # 按日期分组
    grouped = {}
    for event in timeline_events:
        date = event["date"]
        if date not in grouped:
            grouped[date] = {"date": date, "events": [], "categories": set()}
        grouped[date]["events"].append({
            "category": event["categories"][0] if event["categories"] else "其他",
            "summary": event["summary"]
        })
        grouped[date]["categories"].update(event["categories"])

    result = []
    for date in sorted(grouped.keys()):
        item = grouped[date]
        result.append({
            "date": date,
            "events": item["events"][:5],  # 每天最多5个事件
            "count": len(item["events"]),
            "categories": list(item["categories"])
        })

    return result


# ============================================================
# 2.5. 人物名称提取
# ============================================================

def extract_persons_from_chunks(chunks: List[Document]) -> Dict[str, Any]:
    """从文档块中提取人物名称

    结合三种方式：
    1. jieba 词性标注 (nr = 人名)
    2. 中文姓名正则 (常见姓 + 1~2字名)
    3. 英文名正则 (大写开头连续词)
    """
    persons = Counter()
    person_context = {}  # name -> sample context

    for chunk in chunks:
        text = chunk.page_content if hasattr(chunk, 'page_content') else str(chunk)

        # 方法1: jieba 词性标注
        words = pseg.cut(text)
        for word, flag in words:
            if flag == 'nr' and len(word) >= 2:
                # 过滤掉无意义的词
                if word not in TITLE_WORDS and not word.isdigit():
                    persons[word] += 1
                    if word not in person_context:
                        # 取标题词周围30字作为上下文
                        idx = text.find(word)
                        start = max(0, idx - 15)
                        end = min(len(text), idx + len(word) + 15)
                        person_context[word] = text[start:end].replace('\n', ' ').strip()

        # 方法2: 中文姓名正则
        for match in CN_NAME_RE.finditer(text):
            name = match.group().strip()
            if len(name) >= 2 and name not in TITLE_WORDS:
                persons[name] += 1
                if name not in person_context:
                    idx = match.start()
                    start = max(0, idx - 15)
                    end = min(len(text), match.end() + 15)
                    person_context[name] = text[start:end].replace('\n', ' ').strip()

        # 方法3: 英文名正则（需要在头衔/动作词/标点后）
        for match in EN_NAME_RE.finditer(text):
            name = match.group(1).strip()
            if 3 <= len(name) <= 30 and name not in TITLE_WORDS and name not in EN_STOP_WORDS:
                # 跳过纯头衔词和月份等非人名
                name_parts = name.split()
                if all(part in TITLE_WORDS or part in EN_STOP_WORDS for part in name_parts):
                    continue
                persons[name] += 1
                if name not in person_context:
                    idx = match.start(1)
                    start = max(0, idx - 20)
                    end = min(len(text), match.end(1) + 20)
                    person_context[name] = text[start:end].replace('\n', ' ').strip()

    # 排序取 Top 30，附带头衔推断
    person_list = []
    for name, count in persons.most_common(30):
        ctx = person_context.get(name, '')
        # 推断头衔：检查上下文中是否包含头衔词
        matched_title = ''
        for title in TITLE_WORDS:
            if title in ctx:
                matched_title = title
                break

        person_list.append({
            "name": name,
            "count": count,
            "context": ctx[:100],
            "title": matched_title,
        })

    return {
        "person_list": person_list,
        "total_persons": len(persons),
        "top_person": person_list[0] if person_list else None,
    }


# ============================================================
# 3. 空间/地理位置提取
# ============================================================

# 中东常见地名坐标 (纬度, 经度)
LOCATION_COORDS = {
    "伊朗": (32.4279, 53.6880),
    "德黑兰": (35.6892, 51.3890),
    "以色列": (31.0461, 34.8516),
    "耶路撒冷": (31.7683, 35.2137),
    "黎巴嫩": (33.8547, 35.8623),
    "贝鲁特": (33.8938, 35.5018),
    "加沙": (31.5000, 34.4667),
    "巴勒斯坦": (31.9474, 35.2272),
    "霍尔木兹海峡": (26.6000, 56.5000),
    "红海": (21.0000, 38.0000),
    "叙利亚": (34.8021, 38.9968),
    "伊拉克": (33.2232, 43.6793),
    "巴格达": (33.3152, 44.3661),
    "也门": (15.5527, 48.5164),
    "沙特阿拉伯": (23.8859, 45.0792),
    "阿曼": (21.4735, 55.9754),
    "巴基斯坦": (30.3753, 69.3451),
    "伊斯兰堡": (33.6844, 73.0479),
    "土耳其": (38.9637, 35.2433),
    "美国": (37.0902, -95.7129),
    "华盛顿": (38.9072, -77.0369),
    "欧洲": (54.5260, 15.2551),
    "地中海": (35.0000, 18.0000),
    "阿联酋": (23.4241, 53.8478),
    "卡塔尔": (25.3548, 51.1839),
    "埃及": (26.8206, 30.8025),
    "约旦": (30.5852, 36.2384),
}

LOCATION_PATTERNS = '|'.join(re.escape(loc) for loc in LOCATION_COORDS.keys())


def extract_locations_from_text(text: str) -> List[Dict]:
    """从文本中提取地理位置"""
    found_locations = []
    seen = set()

    pattern = re.compile(LOCATION_PATTERNS)
    matches = pattern.findall(text)

    for match in matches:
        if match in seen:
            continue
        seen.add(match)
        coords = LOCATION_COORDS.get(match)
        if coords:
            found_locations.append({
                "name": match,
                "lat": coords[0],
                "lng": coords[1],
                "count": text.count(match)
            })

    return sorted(found_locations, key=lambda x: x['count'], reverse=True)


def extract_spatial_data(all_chunks: List[Document]) -> Dict[str, Any]:
    """提取空间态势数据"""
    location_counter = Counter()
    location_contexts = {}

    for chunk in all_chunks:
        text = chunk.page_content if hasattr(chunk, 'page_content') else str(chunk)
        locations = extract_locations_from_text(text)

        for loc in locations:
            location_counter[loc['name']] += loc['count']
            if loc['name'] not in location_contexts:
                location_contexts[loc['name']] = []
            # 保存包含该地名的文本片段作为上下文
            context_snippet = text[:300].replace('\n', ' ').strip()
            if len(location_contexts[loc['name']]) < 3:
                location_contexts[loc['name']].append(context_snippet)

    # 构建结果
    locations_with_meta = []
    for name, count in location_counter.most_common(20):
        coords = LOCATION_COORDS.get(name)
        if coords:
            locations_with_meta.append({
                "name": name,
                "lat": coords[0],
                "lng": coords[1],
                "mention_count": count,
                "contexts": location_contexts.get(name, [])[:2]
            })

    return {
        "locations": locations_with_meta,
        "total_locations": len(locations_with_meta),
        "top_location": locations_with_meta[0] if locations_with_meta else None
    }


# ============================================================
# 4. 综合统计分析
# ============================================================

def compute_document_stats(docs: List[Document], file_name: str,
                           entity_data: Dict, timeline: List[Dict],
                           spatial_data: Dict, person_data: Optional[Dict] = None) -> Dict[str, Any]:
    """计算文档的综合统计信息"""
    text_lengths = [len(doc.page_content) for doc in docs if hasattr(doc, 'page_content')]

    meta = {
        "title": file_name,
        "processed_at": datetime.now().isoformat(),
        "total_chunks": len(docs),
        "total_entities": entity_data.get("total_nodes", 0),
        "total_relations": entity_data.get("total_rels", 0),
        "timeline_events": sum(item.get("count", 0) for item in timeline),
        "locations_found": spatial_data.get("total_locations", 0),
        "persons_found": person_data.get("total_persons", 0) if person_data else 0,
    }

    stats = {
        "text_lengths": text_lengths,
        "mean_chunk_size": int(np.mean(text_lengths)) if text_lengths else 0,
        "median_chunk_size": int(np.median(text_lengths)) if text_lengths else 0,
        "max_chunk_size": max(text_lengths) if text_lengths else 0,
        "min_chunk_size": min(text_lengths) if text_lengths else 0,
        "total_chars": sum(text_lengths),
        "date_range": {
            "start": timeline[0]["date"] if timeline else None,
            "end": timeline[-1]["date"] if timeline else None,
        } if timeline else None,
    }

    # 实体类型分布
    entity_distribution = {}
    for item in entity_data.get("node_types", []):
        entity_distribution[item["label"]] = item["count"]

    # 关系类型分布
    rel_distribution = {}
    for item in entity_data.get("rel_types", []):
        rel_distribution[item["type"]] = item["count"]

    return {
        "meta": meta,
        "stats": stats,
        "entity_distribution": entity_distribution,
        "relation_distribution": rel_distribution,
    }


# ============================================================
# 5. 主入口: 综合分析管道
# ============================================================

def run_data_analysis(graph, docs: List[Document], file_name: str) -> Dict[str, Any]:
    """
    运行完整的数据分析管道

    Args:
        graph: Neo4jGraph 实例
        docs: 处理后的文档块列表
        file_name: 上传的文件名

    Returns:
        包含所有分析结果的字典，结构兼容6视图渲染
    """
    logger.info("=" * 50)
    logger.info("开始数据分析和清洗管线...")
    logger.info("=" * 50)

    # Step 1: 从Neo4j提取实体数据
    logger.info("[1/7] 提取实体和关系数据...")
    entity_data = extract_entities_from_neo4j(graph)
    edges = extract_graph_edges(graph)
    logger.info(f"  实体类型: {len(entity_data['node_types'])}, 总节点: {entity_data['total_nodes']}")

    # Step 2: 关键词与主题分析
    logger.info("[2/7] 关键词分析...")
    keyword_data = extract_keyword_analysis(docs)
    logger.info(f"  提取到 {len(keyword_data['keywords'])} 个关键词, {len(keyword_data['category_distribution'])} 个事件类别")

    # Step 3: 提取人物名称
    logger.info("[3/7] 提取人物名称...")
    person_data = extract_persons_from_chunks(docs)
    logger.info(f"  识别到 {person_data['total_persons']} 个人物名称")

    # Step 4: 提取事件时间线
    logger.info("[4/7] 提取事件时间线...")
    timeline = extract_timeline_from_chunks(docs)
    logger.info(f"  提取到 {len(timeline)} 个日期节点, {sum(t['count'] for t in timeline)} 个事件")

    # Step 5: 提取空间位置
    logger.info("[5/7] 提取空间态势数据...")
    spatial_data = extract_spatial_data(docs)
    logger.info(f"  发现 {spatial_data['total_locations']} 个地理位置")

    # Step 6: 计算统计信息
    logger.info("[6/7] 计算综合统计...")
    stats = compute_document_stats(docs, file_name, entity_data, timeline, spatial_data, person_data)

    # Step 7: 构建图数据(用于前端知识图谱可视化)
    logger.info("[7/7] 构建知识图谱数据...")
    graph_data = _build_graph_for_visualization(entity_data, edges)

    result = {
        "file_name": file_name,
        "entity_data": entity_data,
        "edges": edges,
        "keyword_data": keyword_data,
        "person_data": person_data,
        "timeline": timeline,
        "spatial_data": spatial_data,
        "stats": stats,
        "graph_data": graph_data,
        "analysis_complete": True,
    }

    logger.info("数据分析管线完成!")
    return result


def _build_graph_for_visualization(entity_data: Dict, edges: List[Dict]) -> Dict:
    """构建适合可视化的图数据结构"""
    nodes = []
    seen_ids = set()

    for node in entity_data.get("all_nodes", []):
        node_id = node.get("id", "")
        if node_id and node_id not in seen_ids:
            seen_ids.add(node_id)
            nodes.append({
                "id": str(node_id),
                "type": node.get("type", "Unknown"),
                "text": (node.get("text") or "")[:100]
            })

    links = []
    for edge in edges:
        links.append({
            "source": str(edge.get("source_id", "")),
            "target": str(edge.get("target_id", "")),
            "type": edge.get("relation", "UNKNOWN"),
            "source_type": edge.get("source_type", "Unknown"),
            "target_type": edge.get("target_type", "Unknown"),
        })

    return {"nodes": nodes, "links": links}


def generate_insights(result: Dict[str, Any]) -> List[str]:
    """基于分析结果生成自动化洞察"""
    insights = []

    stats = result.get("stats", {})
    meta = stats.get("meta", {})
    stat_data = stats.get("stats", {})

    # 文档概况
    insights.append(f"文档共分为 **{meta.get('total_chunks', 0)}** 个文本块进行分析")

    # 实体洞察
    total_entities = meta.get("total_entities", 0)
    total_relations = meta.get("total_relations", 0)
    if total_entities > 0:
        insights.append(f"识别出 **{total_entities}** 个实体和 **{total_relations}** 个关系")

    # 实体类型排名
    entity_dist = stats.get("entity_distribution", {})
    if entity_dist:
        top_entity = max(entity_dist, key=entity_dist.get)
        insights.append(f"最常见的实体类型: **{top_entity}** ({entity_dist[top_entity]} 个)")

    # 时间线洞察
    timeline = result.get("timeline", [])
    if timeline:
        date_range = stat_data.get("date_range", {})
        if date_range and date_range.get("start"):
            insights.append(f"事件时间跨度: {date_range['start']} ~ {date_range['end']}")

        # 事件分类统计
        all_categories = Counter()
        for day in timeline:
            for event in day.get("events", []):
                all_categories[event.get("category", "其他")] += 1
        if all_categories:
            top_cat = all_categories.most_common(1)[0]
            insights.append(f"最主要事件类型: **{top_cat[0]}** ({top_cat[1]} 次)")

    # 空间洞察
    spatial = result.get("spatial_data", {})
    top_loc = spatial.get("top_location")
    if top_loc:
        insights.append(f"最常提及的地理位置: **{top_loc['name']}** ({top_loc['mention_count']} 次)")

    # 关键词洞察
    keyword_data = result.get("keyword_data", {})
    keywords = keyword_data.get("keywords", [])
    if keywords:
        top_kw = [k["term"] for k in keywords[:8]]
        insights.append(f"文档核心关键词: **{', '.join(top_kw)}**")

    # 事件类别分布洞察
    cat_dist = keyword_data.get("category_distribution", {})
    if cat_dist:
        top_cats = list(cat_dist.items())[:3]
        cat_str = ", ".join(f"**{c}** ({n}次)" for c, n in top_cats)
        insights.append(f"主要事件类别: {cat_str}")

    # 人物洞察
    person_data = result.get("person_data", {})
    if person_data and person_data.get("person_list"):
        top_person = person_data["person_list"][0]
        title_str = f"({top_person['title']})" if top_person.get("title") else ""
        insights.append(
            f"识别到 **{person_data['total_persons']}** 个人物，"
            f"最频繁: **{top_person['name']}**{title_str} (提及 {top_person['count']} 次)"
        )

    # 文本统计
    if stat_data.get("total_chars", 0) > 0:
        insights.append(f"文档总字符数: **{stat_data['total_chars']:,}**, 平均块大小: **{stat_data.get('mean_chunk_size', 0)}** 字符")

    return insights
