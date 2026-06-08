---
title: "中东冲突资料包：时间线、新闻、数据与知识图谱抽取种子"
author: "ChatGPT 资料整理"
date: "2026-06-08"
language: zh-CN
---

# 中东冲突资料包：时间线、新闻、数据与知识图谱抽取种子

> 目的：本文件不是政治立场文本，而是为了测试知识图谱生成而设计的高密度、长跨度、多实体资料包。它把“中东冲突”视为一个相互耦合的冲突系统：巴以/阿以冲突、黎巴嫩战线、伊朗-以色列/美国对抗、伊拉克与叙利亚战争、也门与红海航运危机、难民与人道系统、能源与海上通道。

> 时间戳：资料整理截至 **2026-06-08**。新闻与数据具有时效性；不同来源对伤亡、身份分类、控制区和责任归属可能存在差异。

## 1. 适合知识图谱抽取的建模说明

### 1.1 推荐的实体类型
- `State`：以色列、伊朗、埃及、约旦、沙特、美国、叙利亚、黎巴嫩、也门等。
- `NonStateActor`：哈马斯、真主党、胡塞/Ansar Allah、ISIS、巴勒斯坦伊斯兰圣战组织、各类民兵。
- `InternationalOrganization`：联合国、OCHA、UNRWA、UNHCR、阿盟、GCC、UNIFIL。
- `Territory`：加沙、西岸、东耶路撒冷、戈兰高地、西奈、南黎巴嫩、红海、霍尔木兹海峡、曼德海峡。
- `Event`：战争、停火、袭击、入侵、协议、选举、政权更迭、制裁、难民流动、航运中断。
- `ClaimOrDispute`：边界、安全控制、难民回归权、耶路撒冷地位、核计划、海上航行自由、代理人支持。
- `HumanitarianMetric`：死亡、受伤、流离失所、粮食不安全、援助资金缺口、过境卡车/托盘、价格指数。

### 1.2 推荐关系谓词
`participated_in`、`attacked`、`retaliated_against`、`supported_by`、`mediated_by`、`governs`、`controls`、`claimed_by`、`displaced`、`reported_by`、`sanctioned_by`、`signed_agreement_with`、`violated_ceasefire_allegedly`、`threatened_shipping_route`、`provided_aid_to`、`blocked_or_restricted`、`caused_price_change`。

### 1.3 事件抽取字段模板
```yaml
Event:
  id: string
  name: string
  start_date: date|year
  end_date: date|year|null
  locations: [Territory]
  actors_primary: [Actor]
  actors_secondary: [Actor]
  event_type: enum
  triggers: [Event|Claim]
  consequences: [Event|Metric|Claim]
  disputed_facts: [string]
  source_ids: [Sxx]
```

## 2. 超长时间线：1915-2026

| 日期 | 事件 | 地域 | 主要行为体 | 类型 | 摘要 | 数据/图谱提示 | 来源 |
|---|---|---|---|---|---|---|---|
| 1915-1916 | Hussein-McMahon correspondence | Arab provinces of Ottoman Empire | Britain; Hashemite leadership; Ottoman Empire | diplomacy | British wartime correspondence encouraged Arab revolt expectations while leaving later sovereignty questions ambiguous. | Ambiguity becomes a recurring grievance in Arab nationalist narratives. | secondary-historical |
| 1916-05 | Sykes-Picot Agreement | Levant; Mesopotamia | Britain; France; Russia; Ottoman territories | secret agreement | British and French spheres of influence were sketched for post-Ottoman Arab provinces. | Boundary-making becomes a KG edge: colonial agreement -> mandates -> state borders. | secondary-historical |
| 1917-11-02 | Balfour Declaration | Palestine | Britain; Zionist movement; Palestinian Arabs | declaration | Britain supported a national home for the Jewish people in Palestine while mentioning civil and religious rights of existing non-Jewish communities. | Core contested claims: national home vs existing population rights. | secondary-historical |
| 1920-04 | San Remo conference and Mandate system | Levant; Iraq | League of Nations; Britain; France | mandate | Former Ottoman provinces were reorganized under British and French mandates. | Creates modern governance units later central to Syria, Lebanon, Iraq, Palestine and Transjordan. | secondary-historical |
| 1922-07 | British Mandate for Palestine confirmed | Palestine | League of Nations; Britain | mandate | Mandate text incorporated the Balfour framework and British administrative control. | Institutional root of later partition debates. | secondary-historical |
| 1936-1939 | Arab Revolt in Palestine | Palestine | Palestinian Arab groups; British authorities; Jewish communities | insurgency | A major revolt against British rule and Jewish immigration was suppressed. | Shows early mass mobilization, policing, insurgency, land and migration disputes. | secondary-historical |
| 1947-11-29 | UN General Assembly Resolution 181 recommends partition | Palestine; Jerusalem | UNGA; Jewish Agency; Arab Higher Committee | UN resolution | The UN General Assembly recommended independent Arab and Jewish states and a special international regime for Jerusalem. | Vote: 33 for, 13 against, 10 abstentions; recommended two states plus Jerusalem internationalization. | S03 |
| 1948-05-14 | Israel declares independence; 1948 Arab-Israeli War begins | Israel/Palestine | Israel; Egypt; Jordan; Syria; Lebanon; Iraq; Palestinian Arabs | interstate war | Israel declared independence as the British Mandate ended; neighboring Arab states intervened; the war reshaped borders beyond the 1947 plan. | U.S. State archive notes Israel gained some territory allocated to Palestinian Arabs; Egypt retained Gaza and Jordan retained West Bank/East Jerusalem. | S04 |
| 1948-12 | Palestinian refugee crisis and UNRWA context | Palestine; neighboring Arab states | Palestinian refugees; Israel; Arab states; UN | displacement | Hundreds of thousands of Palestinians became refugees during/after the 1948 war, creating a persistent refugee and right-of-return issue. | Often cited around 700,000+ displaced; exact figures and causation remain contested. | S02 |
| 1949 | Armistice lines / Green Line | Israel; Gaza; West Bank; Jerusalem | Israel; Egypt; Jordan; Syria; Lebanon | armistice | Armistice agreements produced lines that became reference points for later diplomacy and occupation debates. | Creates important geospatial entity: 1949 Armistice Line / Green Line. | secondary-historical |
| 1956-10 | Suez Crisis | Egypt; Sinai; Suez Canal | Egypt; Israel; Britain; France; US; USSR; UN | interstate war | Egypt nationalized the Suez Canal; Israel, Britain and France attacked; U.S.-Soviet pressure led to withdrawal. | Shows global powers constraining regional war. | secondary-historical |
| 1964-05 | PLO founded | Jerusalem; Arab League context | PLO; Arab League; Palestinian factions | organization | The Palestine Liberation Organization became a central umbrella for Palestinian national politics and armed struggle. | Entity type: political organization / national movement. | secondary-historical |
| 1967-06 | Six-Day War | Sinai; Gaza; West Bank; East Jerusalem; Golan Heights | Israel; Egypt; Jordan; Syria | interstate war | Israel captured Sinai, Gaza, West Bank, East Jerusalem and the Golan Heights. | Creates occupation nodes and land-for-peace framework; UN Security Council Resolution 242 follows. | S01 |
| 1970-09 | Black September in Jordan | Jordan | Jordanian monarchy; PLO factions; Syria | civil conflict | Jordanian state forces clashed with Palestinian armed organizations; PLO leadership later relocated to Lebanon. | Links Palestinian armed politics to Lebanon civil-war dynamics. | secondary-historical |
| 1973-10 | Yom Kippur / October War | Sinai; Golan Heights | Egypt; Syria; Israel; US; USSR | interstate war | Egypt and Syria attacked Israeli positions; the war triggered superpower crisis diplomacy and oil embargo politics. | Produces later disengagement agreements and Camp David pathway. | S01 |
| 1975-1990 | Lebanese Civil War | Lebanon | Maronite parties; Palestinian groups; Lebanese left; Syria; Israel; militias | civil war | Lebanon’s sectarian-political order collapsed into multi-sided civil war with Palestinian, Syrian and Israeli interventions. | Multi-actor graph with militias, foreign armies, confessional parties. | secondary-historical |
| 1978-09 | Camp David Accords | Egypt; Israel; Sinai | Egypt; Israel; US | peace framework | Egypt and Israel agreed to a framework leading to the 1979 treaty. | First Arab state peace treaty with Israel; Sinai returned to Egypt. | S01 |
| 1979-02 | Iranian Revolution | Iran; Gulf | Iranian revolutionaries; Pahlavi state; US; regional monarchies | regime change | Iran’s monarchy fell; the Islamic Republic became a central revisionist actor in Gulf and Levant politics. | Entity shift: Iran/Pahlavi -> Islamic Republic; alters patronage networks. | secondary-historical |
| 1979-03 | Egypt-Israel Peace Treaty | Egypt; Israel | Egypt; Israel; US | peace treaty | Egypt recognized Israel and Sinai withdrawal was scheduled. | Egypt suspended by Arab League for a period; peace removes largest Arab military from Arab-Israeli war coalition. | S01 |
| 1980-1988 | Iran-Iraq War | Iran; Iraq; Gulf | Iran; Iraq; Gulf monarchies; US; USSR | interstate war | Iraq invaded Iran; an eight-year war killed hundreds of thousands and militarized Gulf security. | Graph layer: state war + oil shipping + chemical weapons + external backing. | secondary-historical |
| 1982-06 | Israel invades Lebanon; PLO expelled from Beirut | Lebanon | Israel; PLO; Syria; Lebanese militias; US mediators | interstate/occupation | Israel invaded Lebanon after cross-border attacks and assassination attempt context; PLO leadership evacuated from Beirut. | Hezbollah emerges later amid occupation and Iranian support. | secondary-historical |
| 1987-12 | First Intifada begins | Gaza; West Bank; East Jerusalem | Palestinian population; Israel; PLO; Hamas | uprising | A mass Palestinian uprising against Israeli occupation began in the occupied Palestinian territory. | UN describes mass uprising in 1987; Hamas founded during this period. | S02 |
| 1988-11 | Palestine National Council proclaims State of Palestine | Algiers; oPt | PLO; Palestine National Council | declaration | The PNC proclaimed the State of Palestine and later diplomacy emphasized two-state recognition. | Adds entity: State of Palestine / diplomatic recognition network. | S02 |
| 1990-08 | Iraq invades Kuwait | Kuwait; Iraq; Gulf | Iraq; Kuwait; US-led coalition; UN Security Council | interstate war | Iraq annexed Kuwait, triggering UN-backed coalition war. | Links Gulf security architecture to permanent U.S. regional military presence. | secondary-historical |
| 1991-10 | Madrid Conference | Madrid; Middle East | US; USSR; Israel; Arab states; Palestinians | peace conference | Post-Gulf War diplomacy opened multilateral and bilateral Arab-Israeli tracks. | Precursor to Oslo and Jordan-Israel treaty. | secondary-historical |
| 1993-09 | Oslo I Accords | Israel; West Bank; Gaza | Israel; PLO; US; Norway | peace process | Israel and PLO mutually recognized each other; the Palestinian Authority framework was created. | Creates PA governance node; final-status issues deferred. | S01 |
| 1994-10 | Jordan-Israel Peace Treaty | Jordan; Israel | Jordan; Israel; US | peace treaty | Jordan became the second Arab state to sign a peace treaty with Israel. | Diplomatic edge: Jordan -> recognizes -> Israel. | secondary-historical |
| 2000-09 | Second Intifada begins | West Bank; Gaza; Israel | Palestinian armed groups; Israel; civilians | uprising/insurgency | A second uprising followed failed final-status talks and rising tensions. | High-casualty urban conflict, suicide bombings, incursions, separation barrier debate. | S01 |
| 2002 | Arab Peace Initiative | Beirut; Arab League | Arab League; Saudi Arabia; Israel; Palestinians | diplomatic proposal | Arab states offered normalization with Israel in exchange for withdrawal from occupied territories and a Palestinian state. | Important unrealized diplomatic template. | secondary-historical |
| 2003-03 | U.S.-led invasion of Iraq | Iraq | US; UK; Iraq; coalition; Iraqi factions | intervention/regime change | The invasion toppled Saddam Hussein and opened a long insurgency and sectarian conflict. | Regional effect: Iran influence in Iraq grows; jihadist networks evolve. | secondary-historical |
| 2005-08 | Israel disengages from Gaza | Gaza | Israel; Palestinian Authority; Hamas | withdrawal | Israel removed settlements and permanent ground forces from Gaza but retained control over airspace, maritime access and crossings with Egypt/Israel disputes. | Legal status of occupation remains contested. | secondary-historical |
| 2006-07 | Israel-Hezbollah War | Lebanon; northern Israel | Israel; Hezbollah; Lebanon; Iran; Syria; UNIFIL | war | Hezbollah captured Israeli soldiers; Israel launched large-scale operations; UN Security Council Resolution 1701 expanded UNIFIL role. | Shows deterrence between Israel and Hezbollah after 2006. | secondary-historical |
| 2006-01 | Hamas wins Palestinian legislative elections | Gaza; West Bank | Hamas; Fatah; Palestinian Authority | election/political rupture | Hamas won legislative elections, deepening international and intra-Palestinian tensions. | Leads to 2007 Gaza-Fatah split. | S01 |
| 2007-06 | Hamas takes control of Gaza; blockade era intensifies | Gaza | Hamas; Fatah; Israel; Egypt | internal conflict/blockade | Hamas seized Gaza from Fatah; Israel and Egypt tightened controls over Gaza crossings. | Creates separate governance nodes: PA/Ramallah and Hamas/Gaza. | S01 |
| 2008-12 | Gaza War / Operation Cast Lead | Gaza; Israel | Israel; Hamas; Palestinian civilians | war | Large-scale Israel-Hamas conflict after rocket fire and blockade-related escalation. | Template for later Gaza wars: rockets, airstrikes, humanitarian crisis, ceasefire mediation. | secondary-historical |
| 2011-03 | Syrian uprising becomes civil war | Syria | Syrian government; opposition; Kurds; jihadists; Iran; Hezbollah; Russia; Turkey; US | uprising/civil war/proxy war | Protests against the Assad government escalated into a multi-sided civil war and internationalized proxy conflict. | Displacement over 13 million by later UNHCR reporting; conflict intersects with ISIS and Kurdish autonomy. | S13 |
| 2011 | Yemen uprising and transition crisis | Yemen | Saleh government; protesters; Houthis; Southern movement; Gulf Cooperation Council | uprising/transition | Arab Spring protests led to a GCC-mediated transition but unresolved power struggles persisted. | Precursor to 2014 Houthi takeover and Saudi-led intervention. | secondary-historical |
| 2014-06 | ISIS declares caliphate | Iraq; Syria | ISIS; Iraq; Syria; Kurds; US-led coalition; Iran-backed militias | jihadist insurgency | ISIS captured territory across Iraq and Syria and declared a caliphate. | Adds transnational non-state actor controlling territory. | secondary-historical |
| 2014-07 | Gaza War / Operation Protective Edge | Gaza; Israel | Israel; Hamas; Palestinian Islamic Jihad | war | Another major Gaza war followed kidnapping/murder crisis, rocket fire and Israeli operations. | Demonstrates recurrence of escalation cycles. | S01 |
| 2014-09 | Houthis take Sanaa | Yemen | Houthis; Hadi government; Saleh forces | coup/insurgency | Houthi movement captured Yemen’s capital, Sanaa. | Houthi control creates later Red Sea and Iran-aligned axis links. | secondary-historical |
| 2015-03 | Saudi-led intervention in Yemen | Yemen | Saudi Arabia; UAE; Houthis; Hadi government; Iran | intervention/proxy war | Saudi-led coalition intervened against the Houthis after Hadi fled. | Yemen becomes humanitarian crisis and regional proxy war. | S10 |
| 2015-07 | JCPOA nuclear agreement | Iran; P5+1 | Iran; US; EU; Russia; China | nuclear diplomacy | Iran and world powers agreed to limits on Iran’s nuclear program in exchange for sanctions relief. | Nuclear file is a major conflict-driver edge: sanctions -> enrichment -> strikes risk. | secondary-historical |
| 2018-05 | US withdraws from JCPOA | Iran; US | US; Iran; EU | policy shift/sanctions | The United States withdrew from the nuclear deal and reimposed sanctions. | Escalates Iran-US tensions; affects Gulf shipping and proxy conflict. | secondary-historical |
| 2019-09 | Attacks on Saudi oil facilities | Saudi Arabia; Gulf | Saudi Arabia; Houthis; Iran; US | strike/infrastructure attack | Abqaiq and Khurais oil facilities were attacked; US and Saudi officials blamed Iran, which denied involvement. | Critical infrastructure node: oil facilities, drones/missiles, attribution dispute. | secondary-historical |
| 2020-01-03 | US kills Qassem Soleimani | Iraq; Iran; US | US; IRGC-Quds Force; Iraq; Iran-backed militias | targeted killing | A U.S. drone strike killed IRGC-Quds Force commander Qassem Soleimani in Baghdad. | Regional network shock: IRGC -> proxy network -> US basing in Iraq. | secondary-historical |
| 2020 | Abraham Accords | UAE; Bahrain; Israel; Morocco; Sudan; US | Israel; UAE; Bahrain; Morocco; Sudan; US | normalization | Several Arab states normalized relations with Israel under U.S.-backed agreements. | Creates normalization track separate from Palestinian final-status settlement. | S01 |
| 2021-05 | Gaza-Israel conflict and Jerusalem unrest | Gaza; Jerusalem; Israel | Israel; Hamas; Palestinian civilians; Israeli civilians | war/civil unrest | Tensions around Jerusalem and evictions contributed to Hamas rocket fire and Israeli airstrikes. | Urban mixed-city violence and Gaza conflict interconnected. | S01 |
| 2022-04 | Yemen truce begins | Yemen | Houthis; Saudi-led coalition; UN | truce | A UN-mediated truce reduced cross-border attacks and major front-line fighting, though political settlement remained elusive. | Fragile de-escalation node; maritime attacks resumed later. | secondary-historical |
| 2023-10-07 | Hamas-led attack on southern Israel | Southern Israel; Gaza | Hamas; Palestinian Islamic Jihad; Israel; civilians | mass attack/war trigger | Hamas-led forces attacked southern Israel, killing civilians and soldiers and taking hostages; Israel launched a large-scale war in Gaza. | Core trigger of 2023-2026 Gaza and regional escalation. | S01 |
| 2023-10 onward | Israel-Hamas war in Gaza | Gaza; Israel | Israel; Hamas; PIJ; civilians; Egypt; Qatar; US | war/humanitarian crisis | Israel’s military campaign and Hamas governance/armed resistance produced massive destruction, displacement and recurring ceasefire-hostage negotiations. | OCHA 2026 reports most Gaza residents displaced, severe aid access restrictions, water and disease risks. | S05;S07 |
| 2023-11 onward | Houthi Red Sea attacks linked to Gaza war | Red Sea; Bab el-Mandeb; Yemen | Houthis; Israel-linked shipping; US; UK; commercial shipping | maritime conflict | Houthis began attacking ships they linked to Israel or Gaza conflict, disrupting Red Sea trade routes. | HRW describes Red Sea attacks as possible war crimes; Reuters 2026 reports renewed threats to Israeli navigation. | S11;S14 |
| 2024-04 | Iran-Israel direct exchange after embassy-consulate strike cycle | Syria; Israel; Iran | Iran; Israel; US; regional partners | direct state exchange | Iran and Israel moved from shadow conflict to direct attacks after strike/retaliation sequences. | Escalation ladder: proxy -> direct drone/missile exchange. | secondary-historical |
| 2024-09 | Lebanon conflict intensifies after nearly a year of border fire | Lebanon; northern Israel | Israel; Hezbollah; Lebanese civilians; UN | war/escalation | After months of exchanges following Oct. 2023, Israeli airstrikes intensified and Lebanon displacement surged. | Reuters/UN reported around 1.2 million displaced in 2024 phase. | S09 |
| 2025-10-10 | Ceasefire agreement referenced in Gaza reporting | Gaza; Israel | Israel; Hamas; US; Egypt; Qatar | ceasefire/truce | OCHA and Reuters 2026 reports refer to a ceasefire announced on 10 October 2025 but continuing violations and unresolved phases. | OCHA: 936 fatalities and 2,903 injuries in Gaza from ceasefire announcement to 3 Jun 2026 per MoH. | S05;S07 |
| 2026-01-19 | UN warns Yemen crisis will worsen in 2026 | Yemen | UN; Yemenis; Houthis; donors | humanitarian warning | UN warned Yemen’s humanitarian situation would worsen amid funding cuts and access constraints. | Estimated 21 million in need of aid in 2026; up from 19.5 million; 2025 funding about 28% of target. | S10 |
| 2026-03-02 | Lebanon drawn into wider regional war | Lebanon; Israel; Iran | Hezbollah; Israel; Iran; US; Lebanese civilians | regional escalation | Reuters reports Lebanon was drawn into wider war in early March 2026 after Hezbollah fired rockets at Israel in solidarity with Iran under U.S.-Israeli attack. | By 5 Jun 2026, Lebanon aid appeal doubled to $639.9m; more than 3,500 killed in Israeli strikes per Lebanese authorities. | S08;S09 |
| 2026-04-17 | U.S.-brokered Lebanon ceasefire begins but fighting continues | Lebanon | US; Israel; Lebanon; Hezbollah | ceasefire/partial compliance | A U.S.-brokered Lebanon ceasefire came into effect after April 16 announcement; fighting persisted in the south. | Lebanese defense minister: 3,491 Israeli airstrikes, 407 controlled demolitions and six razing operations from Apr 17-Jun 7. | S08 |
| 2026-06-03 | OCHA Gaza situation report snapshot | Gaza; West Bank | OCHA; MoH Gaza; Israel; humanitarian partners | humanitarian data | OCHA reported daily strikes, constraints on aid, water shortages, pest/rodent risks, and West Bank settler violence/demolition patterns. | May aid pallets: 51,900 at Kerem Shalom/Zikim; prices +235% vs pre-Oct 2023; West Bank >950 settler incidents in 2026. | S05;S06 |
| 2026-06-08 | Reuters reports Gaza strikes and control-zone expansion | Gaza | Israel; Hamas; Egypt mediators; Palestinian civilians | war/negotiation | Reuters reported six Palestinians killed in strikes as Cairo ceasefire talks continued; Israel controlled more than 60% of Gaza and Netanyahu ordered expansion toward 70%. | Nearly entire 2 million population living in small coastal strip; over 950 killed since truce according to health officials. | S07 |
| 2026-06-08 | Houthis threaten Israeli shipping in Red Sea | Yemen; Red Sea | Houthis; Israel-linked shipping; Iran; commercial shipping | maritime threat | Houthis announced a ban on Israeli maritime navigation in the Red Sea, heightening concerns over misidentification and rerouting. | Red Sea remained essential because Strait of Hormuz closure since February 2026 increased reliance on alternate oil route, per Reuters. | S11 |

## 3. 当前新闻态势摘要（截至 2026-06-08）

### 3.1 加沙：停火未解决控制区、援助与安全问题
- 2026-06-08，Reuters 报道以色列空袭造成 6 名巴勒斯坦人死亡，其中包括一名 8 岁儿童；与此同时，开罗新一轮停火谈判继续。报道还称，以军控制加沙 **60% 以上** 地域，内塔尼亚胡要求扩大到 **70%**，几乎全部约 200 万人口被压缩在沿海狭小地带。`Source: S07`
- OCHA 2026-06-05 情况报告称：Zikim 过境点关闭两周，Kerem Shalom 成为仅存获批货运通道；援助车队因新检查点拥堵、筛查慢和燃料减少而受阻。`Source: S05`
- OCHA 引述加沙卫生部：自 2025-10-10 停火协议宣布至 2026-06-03，报告 **936 人死亡、2,903 人受伤**；2026-05-20 至 2026-06-03 期间新增 **45 人死亡、254 人受伤**，另有遗体寻获和伤重死亡。`Source: S05`
- 市场与生计：OCHA 记录 2026 年 5 月约 **51,900 托盘**援助经 Kerem Shalom 和 Zikim 卸货待收取；加沙价格相较 2023 年 10 月前上涨 **235%**，相较 2025 年 10 月停火到 2026 年 2 月底区域升级之间的阶段上涨 **88%**。`Source: S05`

### 3.2 西岸：拆除、定居者暴力与长期位移
- OCHA 报告 2026 年初至 6 月初，西岸记录 **950 起以上**造成伤亡、财产损毁或两者兼有的定居者袭击，涉及 **230 多个社区**，平均约每日 6 起。`Source: S05`
- 2026-05-19 至 2026-06-01，OCHA 记录以色列当局拆除 **73 座**巴勒斯坦人拥有的结构，导致 **126 人**流离失所，其中 **57 名儿童**。`Source: S05`
- 自 2025 年 1 月以来，Jenin、Tulkarm、Nur Shams 难民营及周边区域已有 **33,000 多名**巴勒斯坦难民流离失所，OCHA 称这是西岸自 1967 年以来持续时间最长、规模最大的位移危机。`Source: S05`

### 3.3 黎巴嫩：停火中的持续打击与人道需求激增
- 2026-06-08，Reuters 报道黎巴嫩国防部长称，从 2026-04-17 至 2026-06-07，以色列在停火期间进行了 **3,491 次空袭、407 次控制爆破、6 次夷平行动**，南部一些村庄被完全夷平。`Source: S08`
- Reuters 2026-06-05 报道，联合国将黎巴嫩援助呼吁翻倍至 **6.399 亿美元**，截至 2026-05-31 已收到 **1.859 亿美元**；报道称自 2026-03-02 以来，黎巴嫩当局数据称以色列打击造成 **3,500 多人死亡**，且 **124 万**黎巴嫩人预计处于危机或紧急粮食不安全水平。`Source: S09`
- 黎巴嫩战线的链条：2026-02/03 伊朗遭美以打击 -> 真主党向以色列发射火箭支持伊朗 -> 以色列对黎巴嫩发动空中和地面行动 -> 黎巴嫩停火虽宣布但南部战斗继续。`Source: S08; S09`

### 3.4 也门与红海：地方内战、区域代理与全球航运
- Reuters 2026-01-19 报道联合国警告也门 2026 年人道危机恶化，预计 **2100 万人**需要人道援助，高于前一年的 **1950 万**；2025 年联合国也门行动仅获目标资金的 **28%**，胡塞控制地区约占人道需求的 **70%**，联合国进入受限。`Source: S10`
- Reuters 2026-06-08 报道胡塞宣布威胁/禁止以色列海上航行进入红海，存在把船只误认为“与以色列相关”的风险。红海在霍尔木兹海峡自 2026 年 2 月关闭后成为更重要的替代石油通道。`Source: S11`
- HRW 将胡塞自 2023 年 11 月以来在红海袭击船只及向以色列发射火箭描述为可能构成战争罪的行为之一。`Source: S14`

## 4. 数据表：人道、军事、经济与通道指标

| 指标 | 地域 | 数值 | 时间点/期间 | 说明 | 来源 |
|---|---|---:|---|---|---|
| 加沙停火后报告死亡 | Gaza | 936 | 2025-10-10至2026-06-03 | OCHA引述加沙卫生部；联合国未必逐项核验 | S05 |
| 加沙停火后报告受伤 | Gaza | 2,903 | 2025-10-10至2026-06-03 | 同上 | S05 |
| 加沙新增死亡 | Gaza | 45 | 2026-05-20至2026-06-03 | 另有5具遗体寻获、2人伤重死亡 | S05 |
| 加沙新增受伤 | Gaza | 254 | 2026-05-20至2026-06-03 | OCHA引述MoH | S05 |
| 以军控制加沙比例 | Gaza | >60% | 2026-06-08 | Reuters报道；内塔尼亚胡称要求扩至70% | S07 |
| 加沙人口集中 | Gaza | ~2,000,000 | 2026-06-08 | 几乎全部人口集中在沿海狭小区域 | S07 |
| 5月援助托盘 | Gaza | 51,900 pallets | 2026-05 | UN 2720机制记录，经Kerem Shalom和Zikim卸货待收取 | S05 |
| 加沙商业车货 | Gaza | 708 truckloads | 2026-05-25至2026-05-31 | Gaza Chamber of Commerce监测；低于升级前1000-1200均值 | S05 |
| 加沙价格涨幅 | Gaza | +235% | 相对2023-10以前 | OCHA市场数据 | S05 |
| 西岸定居者袭击 | West Bank | >950 incidents | 2026年初至2026-06-01 | 涉及230多个社区，约每日6起 | S05 |
| 西岸拆除结构 | West Bank | 73 structures | 2026-05-19至2026-06-01 | 导致126人位移，含57名儿童 | S05 |
| 西岸难民营位移 | West Bank | >33,000 people | 自2025-01以来 | Jenin/Tulkarm/Nur Shams及周边 | S05 |
| 黎巴嫩停火期空袭 | Lebanon | 3,491 airstrikes | 2026-04-17至2026-06-07 | 黎巴嫩国防部长数据 | S08 |
| 黎巴嫩控制爆破 | Lebanon | 407 demolitions | 2026-04-17至2026-06-07 | 黎巴嫩国防部长数据 | S08 |
| 黎巴嫩位移 | Lebanon | >1,000,000 people | 截至2026-06-08 | 约全国人口五分之一 | S08 |
| 黎巴嫩援助呼吁总额 | Lebanon | $639.9m | 2026-06-05 | 联合国翻倍援助呼吁 | S09 |
| 黎巴嫩粮食不安全 | Lebanon | 1.24m people | 至2026-08预测 | 危机和紧急水平 | S09 |
| 也门需援助人数 | Yemen | 21m people | 2026 | 联合国预计，高于前一年19.5m | S10 |
| 也门2025资金覆盖 | Yemen | 28% of target | 2025 | 联合国也门行动资金 | S10 |
| 胡塞控制区需求占比 | Yemen | ~70% | 2026-01 | 联合国无法进入胡塞控制地区，需求占比约70% | S10 |
| 全球强迫流离失所 | Global | >122m people | 2025报告 | UNHCR数据，AP报道 | S13 |

## 5. 主要行为体与关系网络

| 行为体 | 类型 | 地理锚点 | 利益/角色 | 典型关系边 |
|---|---|---|---|---|
| Israel | state | Jerusalem/Tel Aviv political-military system | Borders, deterrence, hostages, Hamas/Hezbollah/IRGC threats, normalization, occupation/security control | attacked_by/attacks Hamas; deterrence_with Hezbollah; allied_with United States; normalization_with UAE/Bahrain/Morocco/Sudan |
| State of Palestine / PLO / Palestinian Authority | proto-state/national movement/governing authority | West Bank/Ramallah; international diplomacy | Self-determination, statehood, end occupation, refugee rights, governance legitimacy | mediates_or_participates depending on theatre |
| Hamas | non-state armed group/governing authority in Gaza | Gaza; regional external offices | Armed resistance, prisoner/hostage exchanges, governance survival, Islamist politics | governs Gaza; attacked Israel 2023-10-07; negotiates_hostages via Egypt/Qatar/US |
| Hezbollah | non-state armed group and Lebanese political actor | Lebanon, especially south and Beirut southern suburbs | Deterrence against Israel, alignment with Iran, Lebanese political leverage | aligned_with Iran; fires_at Israel; participates_in Lebanese politics |
| Iran / Islamic Republic / IRGC-Quds Force | state and transnational patronage network | Iran; Iraq; Syria; Lebanon; Yemen; Gulf | Regime security, deterrence, anti-Israel/anti-US posture, nuclear bargaining, regional depth | supports Hezbollah/Houthis/various militias; sanctioned_by US/EU; direct_exchange_with Israel |
| United States | external great power | Gulf bases; Israel; Iraq/Syria; diplomacy | Alliance protection, counterterrorism, nuclear nonproliferation, shipping lanes, mediation | mediates_or_participates depending on theatre |
| Egypt | state/mediator | Egypt; Sinai; Gaza border | Gaza border control, mediation, Sinai security, treaty with Israel | mediates_or_participates depending on theatre |
| Jordan | state/mediator | Jordan; West Bank ties; Jerusalem holy sites role | Regime stability, Palestinian population balance, custodianship, treaty with Israel | mediates_or_participates depending on theatre |
| Saudi Arabia | regional state | Gulf; Yemen; normalization diplomacy | Iran containment, Yemen border/security, energy infrastructure, regional leadership | mediates_or_participates depending on theatre |
| UAE | regional state | Gulf; Yemen legacy; Abraham Accords | Trade/security, anti-Islamist networks, ports, normalization | mediates_or_participates depending on theatre |
| Houthis / Ansar Allah | non-state armed movement/de facto authority | Northern Yemen; Red Sea missile/drone reach | Yemeni power, anti-Saudi/anti-Israel posture, leverage via Red Sea shipping | controls Sanaa/north Yemen; threatens Red Sea shipping; aligned_or_supported_by Iran |
| Syrian state / post-2024 transitional authorities | state authority in flux | Syria | Territorial control, reconstruction, sanctions relief, factional settlement | mediates_or_participates depending on theatre |
| Turkey | regional state | Northern Syria; Iraq border; Eastern Mediterranean | Kurdish armed groups, refugees, influence in Syria, energy/maritime interests | mediates_or_participates depending on theatre |
| Russia | external great power | Syria military foothold; diplomacy | Mediterranean access, Assad/post-Assad leverage, great-power bargaining | mediates_or_participates depending on theatre |
| UN / OCHA / UNRWA / UNHCR | international organizations | Humanitarian and diplomatic theatres | Aid coordination, refugee services, monitoring, legal norms, ceasefire diplomacy | reports humanitarian metrics; coordinates aid; mandated services for refugees |

## 6. 冲突系统的“层”：从单线叙事到多层图谱

### 6.1 领土-主权层
- 巴勒斯坦/以色列：1947分治、1949绿线、1967占领、定居点、耶路撒冷地位、加沙控制权。
- 叙利亚/以色列：戈兰高地。
- 黎巴嫩/以色列：蓝线、Shebaa Farms争议、南黎巴嫩安全区历史。
- 伊拉克/科威特：1990-1991战争后边界与赔偿秩序。

### 6.2 安全困境层
- 以色列安全叙事：火箭、隧道、跨境袭击、伊朗核与导弹、真主党精确制导武器。
- 巴勒斯坦安全/权利叙事：占领、封锁、定居点、军事行动、难民和迁徙限制。
- 伊朗安全叙事：美国基地、制裁、政权安全、以色列袭击风险、海峡威慑。
- 海湾安全叙事：伊朗导弹/无人机、能源设施、航道、也门边境。

### 6.3 代理人与“抵抗轴心”层
伊朗与真主党、胡塞、伊拉克和叙利亚部分民兵之间存在政治、军事或意识形态关联。不同来源对“控制”“支持”“代理”的定义不同，知识图谱应把它们拆成更细的关系：`funded_by`、`armed_by`、`trained_by`、`politically_aligned_with`、`operationally_coordinated_with`、`claimed_independent_action`。

### 6.4 人道-法律层
同一事件可产生多个法律标签：战争罪指控、比例原则争议、人道准入限制、绑架/扣押人质、任意拘押、集体惩罚指控、对民用基础设施的损害。知识图谱中建议把“指控者”和“被指控者”作为边的限定字段，而不要把未裁定指控写成事实。

### 6.5 能源与航运层
红海、曼德海峡、苏伊士运河、霍尔木兹海峡和海湾油气基础设施把局部战争扩展成全球供应链风险。胡塞袭击或威胁船只、伊朗-美国海上对峙、沙特油田袭击都应链接到 `ShippingRoute`、`InsuranceRate`、`OilPrice`、`ReroutingAroundAfrica` 等节点。

## 7. 代表性“事件链”示例

### 1947-1949 分治到难民问题
`UNGA 181 -> 1948战争 -> 1949停战线 -> 巴勒斯坦难民/UNRWA -> 1967占领 -> 最终地位谈判`

### 1967到土地换和平
`六日战争 -> 242号决议 -> 1973战争 -> Camp David -> 埃以和平 -> 约以和平 -> 阿拉伯和平倡议`

### 黎巴嫩战线
`PLO迁入黎巴嫩 -> 黎巴嫩内战 -> 1982以色列入侵 -> 真主党兴起 -> 2006战争 -> 2023边境交火 -> 2026黎巴嫩升级`

### 伊朗区域网络
`1979革命 -> 1980-88两伊战争 -> IRGC-Quds Force -> 真主党/伊拉克民兵/叙利亚战场/胡塞 -> 伊朗-以色列直接交火风险`

### 加沙循环
`2005撤离 -> 2006哈马斯胜选 -> 2007加沙分裂/封锁 -> 2008/2012/2014/2021战争 -> 2023-2026战争与停火`

### 也门到红海
`2011也门转型 -> 2014胡塞占领萨那 -> 2015沙特干预 -> 2022休战 -> 2023红海袭击 -> 2026威胁以色列航行`

## 8. 新闻事件抽取样例（2026）

```json

[
  {
    "event_id": "EVT-2026-GAZA-0608",
    "name": "Reuters reports six killed in Gaza strikes amid Cairo talks",
    "date": "2026-06-08",
    "locations": [
      "Gaza",
      "Khan Younis",
      "Jabalia",
      "Deir al-Balah",
      "Cairo"
    ],
    "actors": [
      "Israel military",
      "Palestinian civilians",
      "Hamas",
      "Egyptian mediators"
    ],
    "metrics": [
      {
        "name": "reported_fatalities",
        "value": 6,
        "unit": "people"
      }
    ],
    "claims": [
      "Israel controls more than 60% of Gaza",
      "Netanyahu directed expansion toward 70%"
    ],
    "sources": [
      "S07"
    ]
  },
  {
    "event_id": "EVT-2026-LEBANON-CEASEFIRE-AIRSTRIKES",
    "name": "Lebanon reports Israeli strikes during ceasefire",
    "date_range": [
      "2026-04-17",
      "2026-06-07"
    ],
    "locations": [
      "South Lebanon",
      "Beirut southern suburbs"
    ],
    "actors": [
      "Israel",
      "Lebanon government",
      "Hezbollah",
      "United States"
    ],
    "metrics": [
      {
        "name": "airstrikes",
        "value": 3491,
        "unit": "strikes"
      },
      {
        "name": "controlled_demolitions",
        "value": 407,
        "unit": "operations"
      }
    ],
    "sources": [
      "S08"
    ]
  },
  {
    "event_id": "EVT-2026-YEMEN-AID-FUNDING",
    "name": "UN warns Yemen humanitarian crisis will worsen",
    "date": "2026-01-19",
    "locations": [
      "Yemen"
    ],
    "actors": [
      "UN",
      "Houthis",
      "Yemeni civilians",
      "Western donors"
    ],
    "metrics": [
      {
        "name": "people_in_need",
        "value": 21000000,
        "unit": "people"
      },
      {
        "name": "2025_funding_coverage",
        "value": 28,
        "unit": "percent"
      }
    ],
    "sources": [
      "S10"
    ]
  }
]

```

## 9. 对知识图谱系统的测试难点

1. **同名与别名**：Houthis/Ansar Allah、Hezbollah/Hizbullah、Palestinian Authority/PA、IRGC-QF/Quds Force、West Bank/Judea and Samaria（政治语境不同）。
2. **事件边界模糊**：一次战争可被命名为 Gaza War、Israel-Hamas war、Operation X、regional escalation。
3. **来源冲突**：伤亡数字可能来自卫生部门、军方、联合国、媒体；应记录 `reported_by` 和 `verification_status`。
4. **参与 vs 支持 vs 控制**：伊朗与地区组织关系应拆为资金、武器、训练、政治支持、作战协调等。
5. **地理层级**：Gaza -> Khan Younis -> Mawasi；West Bank -> Tulkarm -> Nur Shams camp；Lebanon -> South Lebanon -> specific villages。
6. **法律标签与事实标签分离**：例如“可能构成战争罪”应是 `legal_assessment_by HRW`，不是系统事实。
7. **时间有效性**：2026-06-08 的控制比例、过境点状态、死亡人数都可能迅速变化。

## 10. 机器可读附件说明

- `events_kg_seed.csv`：长时间线事件表，含日期、地域、行为体、事件类型、摘要、数据提示、来源。
- `actors.csv`：行为体字典，含类型、地理锚点、利益/角色。
- `kg_triples_seed.json`：从事件表生成的初始三元组，适合作为图谱导入或评测种子。

## 11. 来源目录

| ID | 机构/媒体 | 标题 | URL |
|---|---|---|---|
| S01 | CFR Education | Israeli-Palestinian Conflict Timeline, last updated 2025-06-24 | https://education.cfr.org/learn/timeline/israeli-palestinian-conflict-timeline |
| S02 | United Nations | History of the Question of Palestine | https://www.un.org/unispal/history/ |
| S03 | UN General Assembly | Resolution 181(II), Partition Plan for Palestine, 1947-11-29 | https://www.un.org/unispal/data-collection/general-assembly/ |
| S04 | U.S. Department of State Archive | The Arab-Israeli War of 1948 | https://2001-2009.state.gov/r/pa/ho/time/cwr/97178.htm |
| S05 | OCHA oPt | Humanitarian Situation Report, 5 June 2026 | https://www.ochaopt.org/content/humanitarian-situation-report-5-june-2026 |
| S06 | OCHA oPt | Reported impact snapshot, Gaza Strip, 3 June 2026 | https://www.ochaopt.org/content/reported-impact-snapshot-gaza-strip-3-june-2026 |
| S07 | Reuters | Israeli military kills six in Gaza and expands control zone, 2026-06-08 | https://www.reuters.com/world/middle-east/israeli-military-kills-four-gaza-expands-control-zone-locals-say-2026-06-08/ |
| S08 | Reuters | Lebanon says Israel has bombed it nearly 3,500 times during ceasefire, 2026-06-08 | https://www.reuters.com/world/middle-east/lebanese-pm-says-israel-has-bombed-lebanon-nearly-3500-times-during-ceasefire-2026-06-08/ |
| S09 | Reuters | UN doubles Lebanon aid appeal as war drives surge in humanitarian needs, 2026-06-05 | https://www.reuters.com/world/middle-east/un-doubles-lebanon-aid-appeal-war-drives-surge-humanitarian-needs-2026-06-05/ |
| S10 | Reuters | Yemen humanitarian crisis to worsen in 2026 amid funding cuts, 2026-01-19 | https://www.reuters.com/world/middle-east/yemen-humanitarian-crisis-worsen-2026-amid-funding-cuts-says-un-2026-01-19/ |
| S11 | Reuters | Yemen Houthis threaten Israeli shipping in Red Sea, 2026-06-08 | https://www.reuters.com/world/middle-east/yemens-iran-backed-houthis-threaten-israeli-shipping-red-sea-2026-06-08/ |
| S12 | ACLED | Middle East Overview: April 2026 | https://acleddata.com/update/middle-east-overview-april-2026 |
| S13 | AP News | UN refugee agency says more than 122 million people forcibly displaced worldwide, 2025 | https://apnews.com/article/ac5a0784474d6ce340a5ba605ee3edce |
| S14 | Human Rights Watch | Yemen country page: humanitarian crisis and Red Sea attacks | https://www.hrw.org/middle-east/n-africa/yemen |

## 12. 可靠性与偏差提示

- 本资料包混合了历史综述、新闻报道、联合国人道报告和人权组织页面。新闻报道用于最新事实，联合国/OCHA用于人道指标，CFR/UN历史页用于长期时间线。
- 伤亡数字常有滞后、政治争议和身份分类差异；不要把“某来源报告”转换成“绝对事实”。
- 中东冲突不是单一因果链，而是多个战场、身份、边界、代理网络和国际制度的叠加系统。知识图谱应该允许多重因果、反事实不确定性和冲突来源并存。
