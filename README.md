# CrySense iOS Web MVP

CrySense 是面向 0 至 12 月龄婴儿家庭的哭声理解与照护辅助原型。本次迭代以 `4d162b7` 为功能基线，将原有 Web MVP 重构为接近真实 iOS App 的启动、登录、检测、结果、设备和反馈流程。

产品主链路是：

`Listen → Understand → Recommend → Ask Permission → Act → Learn`

CrySense 不是通用智能家居控制器。设备动作只能由本次哭声分析生成，并且必须先展示 AutomationPlan，再由用户明确授权执行。病理风险、异常哭声、危险体征和低置信度结果会阻断全部设备控制。

## 本地运行

该项目无需安装运行时依赖。建议通过 localhost 打开，以便浏览器模拟麦克风权限：

```powershell
python -m http.server 4173
```

访问 `http://localhost:4173/?fresh=1` 可从 Launch Screen 重新体验完整流程。登录和权限均为本地模拟，不会发送真实 OAuth 请求或设备命令。

## 已实现

- Launch Screen、三页 Onboarding、Apple 登录主入口和邮箱次入口
- 登录后的五栏 Tab Bar：`首页 / 时间线 / 设备 / 社区 / 我的`
- 原“洞察”完整并入时间线，通过“记录 / 洞察”分段切换查看事件与规律
- 首页保留快速记录、禾禾的一天和最近分析，并加入双列小卡、破形卡面与原创卡通婴儿主检测卡
- 轻量社区 Mock：同月龄片刻、主题筛选、温暖回应、收藏与举报状态
- 私密优先的“宝宝小记”，支持家庭可见、主动公开和可选写入家庭时间线
- AI 艺术照相馆 Mock：宝宝大头贴、绘本小主角、温柔漫画格；不读取或上传真实照片
- 五秒哭声采集倒计时与独立硬停止保护，结束后自动进入分析
- 录音前危险体征问询，以及病理风险、异常哭声和低置信度安全分流
- 高置信度且安全时生成可审阅的推荐环境方案
- 每项动作展示设备、参数、持续时间和状态，并支持取消单项动作
- 即使设备已经处于建议状态，也保留完整方案并明确提示“保持即可”
- 最终 iOS Bottom Sheet 确认；未授权时不调用任何设备命令
- 智能婴儿床、智能灯、温控、温湿度传感器、白噪声机和加湿器 Mock
- 设备详情、连接测试和“可用于照护方案”开关
- Online、Offline、Unauthorized、Connected 设备状态
- 执行中、已完成、部分失败和执行失败状态，以及单设备失败隔离
- 哭声分析、授权、执行、反馈和干预效果的本地数据闭环
- 麦克风、家庭设备和通知权限按需申请
- 集中的 iOS 设计 token、Safe Area、44pt 触控目标和系统字体栈
- 薰衣草紫品牌 tint 与饥饿、困倦、不适、未分类四组可访问的哭因粉彩语义色

## 核心模块

- `src/constants.js`：采集时长、安全类型、哭因和置信度阈值
- `src/recording.js`：可测试的五秒倒计时与自动完成逻辑
- `src/smart-home.js`：`Device / Capability / SuggestedAction / AutomationPlan / UserConsent / ExecutionResult`
- `src/analysis-store.js`：结构化分析、执行和反馈记录
- `src/community.js`：`BabyMoment / CommunityPost / AIArtworkJob` 的本地 Mock、可见范围与状态生命周期
- `app.js`：应用状态、页面流程、权限 Sheet、分析与设备交互
- `styles.css`：iOS typography、spacing、radius、color、safe-area 等设计 token
- `docs/ios-ui-guidelines.md`：本次移动端设计和交互验收基线
- `docs/PRD-v3.1-timeline-community-visual-iteration.md`：时间线洞察、轻社区、宝宝小记和 AI 影像增量需求

`MockSmartHomeAdapter` 实现了当前演示。`SmartHomeAdapter` 保留了 Matter、Apple Home / HomeKit、Home Assistant、小米 IoT 和厂商 SDK 的适配边界；本版本未连接任何真实平台。

## 测试

```powershell
npm test
npm run check
```

自动化测试覆盖五秒倒计时、自动分析回调、安全门控、未授权零命令、困倦和饥饿策略、上下文相关不适策略、设备状态变化、部分失败与数据闭环。另需按 `docs/ios-ui-guidelines.md` 在常见 iPhone 尺寸完成视觉验收。

## 数据与医疗边界

每次识别保存 `CryAnalysis ID / Timestamp / CryReason / Probability Distribution / Confidence / SafetyResult / RecommendedActions / UserConsent / ExecutedActions / ExecutionResult / UserFeedback / InterventionEffective`。

当前分析、异常检测、登录、权限和智能家居均为产品流程 Mock，不具备真实筛查或诊断能力。智能家居行为可用于未来的 Personalized Comfort Policy，但不得直接作为医学诊断依据。任何正式产品都需要经过隐私、安全、临床和目标市场合规审核。
