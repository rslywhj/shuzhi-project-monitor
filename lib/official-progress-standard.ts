export const OFFICIAL_PROGRESS_WORKBOOK = "统建系统建设及数据治理三级进度计划.xlsx";

export const officialMilestoneStandard = [
  {
    "code": "N01",
    "sourceCode": "1.1",
    "name": "1.1 项目团队组建",
    "sequence": 1,
    "stage": "立项阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目核心团队组建、角色分工与职责确认，明确项目经理、总体组、项控组及子任务组人员",
    "deliverable": "项目组织机构成立通知、团队分工与职责表",
    "predecessor": "无",
    "riskPoint": "核心人员资源不到位、人员稳定性不足"
  },
  {
    "code": "N02",
    "sourceCode": "1.2",
    "name": "1.2 业务需求调研与梳理",
    "sequence": 2,
    "stage": "立项阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成业务现状、痛点及需求调研，梳理项目业务范围、价值流覆盖情况",
    "deliverable": "项目立项论证报告初稿",
    "predecessor": "1.1 项目团队组建",
    "riskPoint": "业务需求不明确、需求范围模糊、业务部门配合不足"
  },
  {
    "code": "N03",
    "sourceCode": "1.3",
    "name": "1.3 立项论证报告编制与签批",
    "sequence": 3,
    "stage": "立项阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "形成项目立项论证报告，明确业务现状、需求、范围、进度计划、组织架构、投资规模等核心内容",
    "deliverable": "项目立项论证报告、分管领导签批",
    "predecessor": "1.2 业务需求调研与梳理",
    "riskPoint": "报告内容不符合架构要求、投资测算不准确"
  },
  {
    "code": "N04",
    "sourceCode": "1.4",
    "name": "1.4 立项架构评审",
    "sequence": 4,
    "stage": "立项阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "按项目等级开展架构评审",
    "deliverable": "立项论证架构评审",
    "predecessor": "1.3 立项论证报告编制与签批",
    "riskPoint": "评审不通过、审批流程延期、架构意见未闭环"
  },
  {
    "code": "N05",
    "sourceCode": "2.1",
    "name": "2.1 项目管理体系搭建",
    "sequence": 5,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "编制项目管理大纲，包括不限于项目主计划、保密方案、风险预案、质量管控方案等内容",
    "deliverable": "项目管理大纲",
    "predecessor": "1.4 立项架构评审",
    "riskPoint": "项目管理体系不规范、责任边界不明确"
  },
  {
    "code": "N06",
    "sourceCode": "2.2",
    "name": "2.2 项目管理大纲签批",
    "sequence": 6,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目管理大纲正式发布",
    "deliverable": "项目管理大纲签批稿",
    "predecessor": "2.1 项目管理体系搭建",
    "riskPoint": "大纲评审不通过、发布流程延期"
  },
  {
    "code": "N07",
    "sourceCode": "2.3",
    "name": "2.3 项目启动会召开",
    "sequence": 7,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目启动材料编制、宣贯培训，组织召开项目启动会，明确项目目标、分工、管理规则",
    "deliverable": "项目启动会材料、会议纪要、签到表",
    "predecessor": "2.2 项目管理大纲签批",
    "riskPoint": "核心人员无法参会、宣贯不到位、目标对齐不足"
  },
  {
    "code": "N08",
    "sourceCode": "2.4",
    "name": "2.4 概要设计方案编制",
    "sequence": 8,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成企业架构L1-L3设计、L4流程清单及集成关系、网络和数据安全专章、技术路线、投资估算等内容编制",
    "deliverable": "项目概要设计报告初稿",
    "predecessor": "2.3 项目启动会召开",
    "riskPoint": "架构设计不符合集团规范、需求与设计脱节、技术路线不可行"
  },
  {
    "code": "N09",
    "sourceCode": "2.5",
    "name": "2.5 概要设计架构评审",
    "sequence": 9,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成概要设计报告内部审查，按项目等级提交对应层级开展架构评审，闭环评审意见",
    "deliverable": "概要设计报告评审修订版、架构评审意见",
    "predecessor": "2.4 概要设计方案编制",
    "riskPoint": "评审不通过、架构意见未闭环、评审流程延期"
  },
  {
    "code": "N10",
    "sourceCode": "2.6",
    "name": "2.6 项目批复咨询评估",
    "sequence": 10,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "提交概要设计提交数智化部，数智化部组织中核咨询开展评估，闭环评估意见，获取评估报告",
    "deliverable": "项目咨询评估报告、终版概要设计报告",
    "predecessor": "2.5 概要设计架构评审",
    "riskPoint": "评估意见未闭环、评估流程延期"
  },
  {
    "code": "N11",
    "sourceCode": "2.7",
    "name": "2.7 项目批复",
    "sequence": 11,
    "stage": "概设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "履行内部决策程序，按决策权限清单提请集团投资决策主体决策，获取项目批复文件",
    "deliverable": "项目批复文件",
    "predecessor": "2.6 项目批复咨询评估",
    "riskPoint": "决策不通过、批复流程延期"
  },
  {
    "code": "N12",
    "sourceCode": "3.1",
    "name": "3.1 采购需求与技术规格书编制",
    "sequence": 12,
    "stage": "项目采购",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "编制项目采购需求、技术规格书，明确采购范围、技术要求、交付标准、商务条款",
    "deliverable": "采购需求文件、技术规格书初稿",
    "predecessor": "2.7 项目批复",
    "riskPoint": "技术规格书不符合采购要求、需求范围不明确"
  },
  {
    "code": "N13",
    "sourceCode": "3.2",
    "name": "3.2 采购需求评审与审批",
    "sequence": 13,
    "stage": "项目采购",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成采购需求、技术规格书的内部评审、业务部门确认，按采购管理办法完成审批流程",
    "deliverable": "采购需求文件、技术规格书签批版",
    "predecessor": "3.1 采购需求与技术规格书编制",
    "riskPoint": "评审不通过、审批流程延期"
  },
  {
    "code": "N14",
    "sourceCode": "3.3",
    "name": "3.3 供应链采购执行",
    "sequence": 14,
    "stage": "项目采购",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "按集团采购管理办法，提交采购需求至供应链部门，完成采购执行、合同签订流程",
    "deliverable": "采购结果文件、正式合同文本",
    "predecessor": "3.2 采购需求评审与审批",
    "riskPoint": "采购流程延期、合同条款谈判受阻"
  },
  {
    "code": "N15",
    "sourceCode": "4.1",
    "name": "4.1 详细需求调研与确认",
    "sequence": 15,
    "stage": "详设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "开展详细业务需求调研，细化业务流程、数据标准、功能需求，完成业务需求最终确认",
    "deliverable": "详细需求规格说明书、需求确认文件",
    "predecessor": "2.7 项目批复",
    "riskPoint": "需求细节不明确、业务部门需求变更、需求确认不及时"
  },
  {
    "code": "N16",
    "sourceCode": "4.2",
    "name": "4.2 详细设计方案编制",
    "sequence": 16,
    "stage": "详设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "编制业务详细设计报告、IT系统详细设计报告，涵盖L4-L5级架构设计、网络和数据安全专篇",
    "deliverable": "业务详细设计报告、IT系统详细设计报告初稿",
    "predecessor": "4.1 详细需求调研与确认",
    "riskPoint": "设计与需求脱节、架构不符合集团规范、安全设计不到位"
  },
  {
    "code": "N17",
    "sourceCode": "4.3",
    "name": "4.3 详细设计方案评审与备案",
    "sequence": 17,
    "stage": "详设阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成详细设计方案内部评审、业务部门确认，评审结论报数字化中心备案",
    "deliverable": "详细设计报告签批版、评审备案文件",
    "predecessor": "4.2 详细设计方案编制",
    "riskPoint": "评审不通过、备案流程延期、设计意见未闭环"
  },
  {
    "code": "N18",
    "sourceCode": "4.4",
    "name": "4.4 数据标准发布",
    "sequence": 18,
    "stage": "详设阶段",
    "defaultWeight": 2.78,
    "critical": true,
    "coreWork": "主数据通过企标进行发布，事务数据通过部门发文发布",
    "deliverable": "主数据标准、事务数据标准",
    "predecessor": "4.3 详细设计方案评审与备案",
    "riskPoint": "评审不通过"
  },
  {
    "code": "N19",
    "sourceCode": "5.1",
    "name": "5.1 业务方案开发与制度输出",
    "sequence": 19,
    "stage": "开发阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "基于项目范围，识别关键活动，输出制度文件、流程文件、标准规范、操作手册等交付物",
    "deliverable": "业务制度文件、流程文件、标准规范、操作手册初稿",
    "predecessor": "4.3 详细设计方案评审",
    "riskPoint": "业务方案与设计脱节、制度文件不符合集团规范"
  },
  {
    "code": "N20",
    "sourceCode": "5.2",
    "name": "5.2 IT系统开发与单元测试",
    "sequence": 20,
    "stage": "开发阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成IT系统各模块开发、单元测试、代码走查，确保开发内容符合设计要求（含数据标准）",
    "deliverable": "系统开发包、单元测试报告、代码走查记录",
    "predecessor": "4.3 详细设计方案评审\n★4.4 数据标准发布",
    "riskPoint": "开发进度延期、代码质量不达标、功能与需求不符"
  },
  {
    "code": "N21",
    "sourceCode": "5.3",
    "name": "5.3 集成测试（含功能、性能、安全等）",
    "sequence": 21,
    "stage": "开发阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成系统各模块集成测试、端到端流程测试，闭环测试发现的问题",
    "deliverable": "系统开发包、单元测试报告、代码走查记录",
    "predecessor": "5.2 IT系统开发与单元测试",
    "riskPoint": "测试覆盖度不足、问题未闭环、测试进度延期"
  },
  {
    "code": "N22",
    "sourceCode": "5.4",
    "name": "5.4 等保/分保测评、安全检测",
    "sequence": 22,
    "stage": "开发阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "安全检测、分级保护/等级保护测评，确保系统满足上线技术与安全要求",
    "deliverable": "技术准入评估报告、安全检测报告、等保测评报告",
    "predecessor": "5.3 集成测试（含功能、性能、安全等）",
    "riskPoint": "安全检测不通过、等保测评未达标"
  },
  {
    "code": "N23",
    "sourceCode": "6.1",
    "name": "6.1 UAT用户验收测试",
    "sequence": 23,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "组织业务关键用户开展UAT验收测试，验证系统功能符合业务需求，闭环测试问题",
    "deliverable": "UAT测试计划、UAT测试报告、问题闭环记录、UAT验收确认文件",
    "predecessor": "5.3 集成测试（含功能、性能、安全等）",
    "riskPoint": "业务用户配合不足、测试问题未闭环、UAT验收不通过"
  },
  {
    "code": "N24",
    "sourceCode": "6.2",
    "name": "6.2 上线架构评审",
    "sequence": 24,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "按项目等级提交对应决策层级开展上线架构评审，闭环评审意见",
    "deliverable": "上线架构评审意见",
    "predecessor": "6.1 UAT用户验收测试",
    "riskPoint": "评审不通过、上线流程延期"
  },
  {
    "code": "N25",
    "sourceCode": "6.3",
    "name": "6.3 历史数据清洗",
    "sequence": 25,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": true,
    "coreWork": "存量数据收集、比对、清洗、迁移，出具清洗报告",
    "deliverable": "数据清洗报告",
    "predecessor": "★4.4 数据标准发布",
    "riskPoint": "数据不符合数据标准"
  },
  {
    "code": "N26",
    "sourceCode": "6.4",
    "name": "6.4 试点上线与切换",
    "sequence": 26,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成试点上线准备、数据迁移、系统切换，启动试点运行",
    "deliverable": "试点上线方案、数据迁移报告、系统切换记录、试点运行启动通知",
    "predecessor": "5.4 等保/分保测评、安全检测\n6.2 上线架构评审",
    "riskPoint": "上线切换失败、数据迁移异常、系统运行不稳定"
  },
  {
    "code": "N27",
    "sourceCode": "6.5",
    "name": "6.5 数据同源验证",
    "sequence": 27,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": true,
    "coreWork": "完成下游系统接口集成、维护入口关闭、全链路数据一致性校验",
    "deliverable": "完成数据同源",
    "predecessor": "6.4 试点上线与切换",
    "riskPoint": "数据不同源、下游未关闭"
  },
  {
    "code": "N28",
    "sourceCode": "6.6",
    "name": "6.6 试点运行与优化",
    "sequence": 28,
    "stage": "试点阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "开展不少于3个月的试点运行，收集试点反馈，优化完善系统功能与业务流程，形成试点总结报告",
    "deliverable": "试点运行记录、问题优化记录、试点总结报告",
    "predecessor": "6.4 试点上线与切换",
    "riskPoint": "试点问题未及时优化、业务部门配合不足、试点总结不全面"
  },
  {
    "code": "N29",
    "sourceCode": "7.1",
    "name": "7.1 全级次推行方案制定",
    "sequence": 29,
    "stage": "推行阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "制定项目全级次推行工作计划，明确推行目标、范围、策略、实施路径、培训计划",
    "deliverable": "全级次推行方案、培训计划",
    "predecessor": "6.3 试点上线与切换",
    "riskPoint": "推行方案不可行、培训计划不完善、资源保障不足"
  },
  {
    "code": "N30",
    "sourceCode": "7.2",
    "name": "7.2 全级次推广培训与上线",
    "sequence": 30,
    "stage": "推行阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "组织开展全级次用户培训、数据准备，完成全级次系统上线与推广",
    "deliverable": "培训材料、培训记录、数据迁移报告、全级次上线确认文件",
    "predecessor": "7.1 全级次推行方案制定",
    "riskPoint": "培训效果不佳、数据准备不充分、上线进度延期"
  },
  {
    "code": "N31",
    "sourceCode": "7.3",
    "name": "7.3 技术验收",
    "sequence": 31,
    "stage": "推行阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目全部建设内容，提交技术验收申请，按项目等级组织开展技术验收，闭环验收问题",
    "deliverable": "技术验收申请、技术验收报告、验收问题闭环记录、技术验收确认文件",
    "predecessor": "完成项目批复建设内容",
    "riskPoint": "验收内容不完整、验收问题未闭环、技术验收不通过"
  },
  {
    "code": "N32",
    "sourceCode": "7.4",
    "name": "7.4 总体验收准备",
    "sequence": 32,
    "stage": "推行阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目决算审计及整改、实物资产转固移交、档案归档移交、项目总结报告编制",
    "deliverable": "项目决算审计报告、资产转固文件、档案归档文件、项目总结报告",
    "predecessor": "7.3 技术验收",
    "riskPoint": "决算审计整改未完成、资产转固不及时、档案归档不符合要求"
  },
  {
    "code": "N33",
    "sourceCode": "7.5",
    "name": "7.5 总体验收批复",
    "sequence": 33,
    "stage": "推行阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "提交总体验收申请，按决策权限组织开展总体验收评审，获取验收结论意见",
    "deliverable": "总体验收申请、总体验收报告、验收批复文件",
    "predecessor": "7.4 总体验收准备",
    "riskPoint": "验收材料不齐全、验收不通过、批复流程延期"
  },
  {
    "code": "N34",
    "sourceCode": "8.1",
    "name": "8.1 系统运行移交与运维保障",
    "sequence": 34,
    "stage": "运营阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成系统运行移交，建立运维保障机制，开展系统日常运维、问题响应、功能优化",
    "deliverable": "系统运行移交文件、运维保障方案、运维记录",
    "predecessor": "6.4 试点运行与优化",
    "riskPoint": "运维保障机制不完善、问题响应不及时、系统运行不稳定"
  },
  {
    "code": "N35",
    "sourceCode": "8.2",
    "name": "8.2 项目结项与复盘",
    "sequence": 35,
    "stage": "运营阶段",
    "defaultWeight": 2.78,
    "critical": false,
    "coreWork": "完成项目全流程资料归档、结项手续办理，组织开展项目复盘，总结经验教训",
    "deliverable": "项目结项文件、项目复盘报告、全流程档案归档清单",
    "predecessor": "8.1 系统运行移交与运维保障",
    "riskPoint": "结项手续不完整、复盘不全面、档案归档不符合要求"
  },
  {
    "code": "N36",
    "sourceCode": "8.3",
    "name": "8.3 项目后评价",
    "sequence": 36,
    "stage": "运营阶段",
    "defaultWeight": 2.7,
    "critical": false,
    "coreWork": "按集团要求开展项目后评价，评估项目目标达成情况、业务价值、投资效益，形成后评价报告",
    "deliverable": "项目后评价报告",
    "predecessor": "8.2 项目结项与复盘",
    "riskPoint": "后评价数据不完整、价值评估不准确"
  }
] as const;

export const officialProjectCatalog = [
  {
    "sourceSequence": 1,
    "name": "核智通 OA 系统（集团公司 OA 系统）",
    "org": "集团办公室",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 2,
    "name": "集团公司移动办公平台 (核协 E+)",
    "org": "集团办公室",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 3,
    "name": "集团公司保密一体化管理系统（2.0）",
    "org": "集团办公室",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 4,
    "name": "核智兰台（集团公司数字档案馆系统）",
    "org": "集团办公室",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 5,
    "name": "一体化保卫平台",
    "org": "集团办公室",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 6,
    "name": "三重一大系统",
    "org": "集团办公室",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 7,
    "name": "投资全周期数字化管控系统",
    "org": "战略发展部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 8,
    "name": "战略到执行管理与运营系统",
    "org": "战略发展部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 9,
    "name": "集团公司核材料综合管控系统",
    "org": "系统工程部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 10,
    "name": "全级次穿透式监管系统",
    "org": "企管法务部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 11,
    "name": "中核制汇（制度内控系统）",
    "org": "企管法务部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 12,
    "name": "集团公司法律纠纷案件数字化管理系统",
    "org": "企管法务部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 13,
    "name": "集团公司合同数智化管理系统项目",
    "org": "企管法务部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 14,
    "name": "集团公司审计风控数智化系统",
    "org": "审计部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 15,
    "name": "深化改革行动数智化系统",
    "org": "企管法务部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 16,
    "name": "集团公司采购与供应链一体化智能服务系统",
    "org": "经营开发部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 17,
    "name": "集团公司核进出口信息管理系统",
    "org": "经营开发部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 18,
    "name": "智能仓储管理系统",
    "org": "经营开发部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 19,
    "name": "智慧物流管理系统",
    "org": "经营开发部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 20,
    "name": "市场开发管理子系统",
    "org": "经营开发部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 21,
    "name": "市场决策支持子系统",
    "org": "经营开发部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 22,
    "name": "客户关系管理子系统",
    "org": "经营开发部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 23,
    "name": "销售订单管理系统",
    "org": "经营开发部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 24,
    "name": "创域互联生态智慧系统",
    "org": "经营开发部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 25,
    "name": "生产管控系统",
    "org": "经营开发部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 26,
    "name": "生产数字化系统（统筹）",
    "org": "经营开发部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 27,
    "name": "国际化经营管理系统",
    "org": "国际合作部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 28,
    "name": "集团公司外事服务管理系统",
    "org": "国际合作部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 29,
    "name": "集团公司境外员工安全保障应急管理系统",
    "org": "国际合作部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 30,
    "name": "绩效管理系统",
    "org": "人力资源部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 31,
    "name": "技术技能人才管理系统",
    "org": "人力资源部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 32,
    "name": "人力资源运营决策系统",
    "org": "人力资源部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 33,
    "name": "集团公司招聘管理系统",
    "org": "人力资源部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 34,
    "name": "干部管理系统",
    "org": "人力资源部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 35,
    "name": "人事档案管理系统",
    "org": "人力资源部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 36,
    "name": "薪酬与激励管理系统",
    "org": "人力资源部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 37,
    "name": "干部监督系统",
    "org": "人力资源部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 38,
    "name": "人力共享管理系统",
    "org": "人力资源部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 39,
    "name": "培训管理系统",
    "org": "人力资源部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 40,
    "name": "集团公司产业金融数字化平台",
    "org": "财资部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 41,
    "name": "集团公司司库系统",
    "org": "财资部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 42,
    "name": "集团公司财务报表系统",
    "org": "财资部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 43,
    "name": "集团公司财务共享系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 44,
    "name": "集团公司智慧税务系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 45,
    "name": "集团公司商旅系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 46,
    "name": "集团公司资产管理系统",
    "org": "财资部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 47,
    "name": "集团公司财务领域大型模型应用系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 48,
    "name": "集团公司市值管理系统",
    "org": "财资部",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 49,
    "name": "全面预算管理系统",
    "org": "财资部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 50,
    "name": "电子会计档案系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 51,
    "name": "集成产品财务管理系统",
    "org": "财资部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 52,
    "name": "需求与规划管理系统",
    "org": "科技创新部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 53,
    "name": "研发集成项目管理子系统",
    "org": "科技创新部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 54,
    "name": "产品数据管理子系统（PDM）",
    "org": "科技创新部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 55,
    "name": "产品研发全生命周期管理系统",
    "org": "科技创新部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 56,
    "name": "研发质量管理系统",
    "org": "科技创新部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 57,
    "name": "集团公司科技管理系统",
    "org": "科技创新部",
    "sourceStage": "开发阶段"
  },
  {
    "sourceSequence": 58,
    "name": "产品开发管理系统",
    "org": "科技创新部",
    "sourceStage": "未启动"
  },
  {
    "sourceSequence": 59,
    "name": "核智枢 ERP 系统",
    "org": "数智化部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 60,
    "name": "转型项目与架构资产管理子系统",
    "org": "数智化部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 61,
    "name": "IT 软件研发一体化平台",
    "org": "数智化部",
    "sourceStage": "开发阶段"
  },
  {
    "sourceSequence": 62,
    "name": "集团公司数据中台（dPaaS）",
    "org": "数智化部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 63,
    "name": "一体化 IT 运维子系统",
    "org": "数智化部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 64,
    "name": "网络安全综合治理平台",
    "org": "数智化部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 65,
    "name": "工程项目一体化管控平台",
    "org": "工程管理部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 66,
    "name": "工程全生命周期管理系统",
    "org": "工程管理部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 67,
    "name": "集团公司质量数字化系统",
    "org": "安全质量环保部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 68,
    "name": "集团公司安全环保信息化系统",
    "org": "安全质量环保部",
    "sourceStage": "概要设计"
  },
  {
    "sourceSequence": 69,
    "name": "核智领航（集团公司党建数字化系统）",
    "org": "党群工作部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 70,
    "name": "集团公司融媒体系统",
    "org": "党群工作部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 71,
    "name": "巡视巡察管理系统",
    "org": "党组巡视办",
    "sourceStage": "详细设计"
  },
  {
    "sourceSequence": 72,
    "name": "集团公司挂靠经营清理管理系统",
    "org": "审计部",
    "sourceStage": "部署推行"
  },
  {
    "sourceSequence": 73,
    "name": "离退休管理系统",
    "org": "社会事务部",
    "sourceStage": "立项阶段"
  },
  {
    "sourceSequence": 74,
    "name": "核工业数字孪生协同系统",
    "org": "经营开发部",
    "sourceStage": "未启动"
  }
] as const;
