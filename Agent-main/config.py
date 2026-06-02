# config.py

import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# API配置
API_CONFIG = {
    'deepseek': {
        'base_url': "https://api.deepseek.com",
        'default_model': "deepseek-chat",
        'api_key': os.getenv('DEEPSEEK_API_KEY', '')
    },
    'openai': {
        'base_url': "https://api.chatanywhere.tech/v1",
        'default_model': "gpt-4o-mini",
        'api_key': os.getenv('OPENAI_API_KEY', '')
    }
}

# Neo4j配置
NEO4J_CONFIG = {
    'url': "neo4j://localhost:7687",
    'username': "neo4j",
    'password': os.getenv('NEO4J_PASSWORD', '')
}

# 本地嵌入配置
EMBEDDING_CONFIG = {
    'local': {
        'base_url': "http://localhost:11434/v1",
        'model': "nomic-embed-text"
    }
}

# 图谱配置 - 军事/国际局势主题
GRAPH_CONFIG = {
    'allowed_nodes': [
        # 军事行动主体
        "军事组织",          # 军队、武装团体、情报机构
        "政府机构",          # 政府部门、外交机构
        "政治人物",          # 国家领导人、外交官、军事指挥官
        # 武器装备与研究
        "武器装备",          # 战机、导弹、舰艇、无人机等
        "武器系统",          # 防空系统、雷达系统等
        # 地理空间
        "地理位置",          # 城市、港口、基地、海峡等具体地点
        "地理区域",          # 国家、地区等大范围区域
        # 事件与行动
        "冲突事件",          # 具体袭击、交战、轰炸事件
        "行动计划",          # 军事行动、部署计划、演习
        "外交事件",          # 谈判、协议、声明、访问
        # 时间与来源
        "时间节点",          # 关键日期、阶段分界点
        "情报来源",          # 新闻机构、官方声明来源
    ],
    'allowed_relationships': [
        # 空间关系
        "部署于",            # 军事力量部署在某地
        "位于",              # 实体位于某地理位置
        "发生于",            # 事件发生在某地
        # 组织关系
        "隶属于",            # 组织隶属关系
        "指挥",              # 指挥链关系
        "盟友",              # 盟友/合作
        "敌对",              # 敌对关系
        # 事件关系
        "打击目标",          # 袭击/打击的目标
        "参与",              # 主体参与事件
        "导致",              # 事件A导致事件B (因果关系)
        "升级为",            # 冲突升级
        "响应于",            # 事件A响应事件B
        # 武器装备
        "研发自",            # 武器研发来源
        "装备",              # 组织装备某武器
        "使用",              # 在某事件中使用某武器
        # 信息关系
        "报道",              # 来源报道某事件
        "证实",              # 多方来源证实
        "矛盾",              # 来源间存在矛盾叙述
    ]
}

# 文档处理配置
DOC_CONFIG = {
    'chunk_size': 1000,
    'chunk_overlap': 40
}

# 应用配置
APP_CONFIG = {
    'title': "中东冲突态势智能分析台",
    'description': """
    本系统聚焦公开军事情报与国际局势分析，上传PDF/DOCX/TXT文献后
    自动完成实体抽取、知识图谱构建与多视图可视化。
    主题限定：中东地区冲突态势、公开军事报道、武器研究相关材料。
    """,
    'logo_path': 'logo.png'
}
