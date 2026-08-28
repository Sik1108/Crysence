# CrySense iOS Web MVP

CrySense 是面向 0 至 12 月龄婴儿家庭的哭声理解与照护辅助原型。本次迭代以 `a74b3aacb0bf9175a4a69de7504020298c30d248` 为基线，完成多宝宝、社区瀑布流与 MiniMax 服务接入。

产品主链路是：

`Listen → Understand → Recommend → Ask Permission → Act → Learn`

CrySense 不是通用智能家居控制器。设备动作只能由本次哭声分析生成，并且必须先展示 AutomationPlan，再由用户明确授权执行。病理风险、异常哭声、危险体征和低置信度结果会阻断全部设备控制。

## 本地运行

该项目无需安装运行时依赖。请在项目目录通过本地服务启动，不要直接双击 `index.html`。浏览器会拦截 `file://` 页面加载 ES Module，导致应用停留在 Launch Screen。

```powershell
npm run dev
```

访问 `http://127.0.0.1:4174/?fresh=1` 可从 Launch Screen 重新体验完整流程。登录和智能设备权限仍为本地模拟。

## MiniMax 配置

复制 `.env.example` 为 `.env` 并填写：

```dotenv
MINIMAX_API_KEY=你的服务端密钥
```

密钥仅由 `scripts/serve.js` 在服务端读取，不会下发到浏览器。正式部署会从反向代理请求自动识别 HTTPS 公网域名，无需手填 `PUBLIC_BASE_URL`。图生图需要 MiniMax 能读取本次临时源图，所以本机 `127.0.0.1` 只能验证界面，不能完成真实图生图。临时源图在 MiniMax 请求结束后立即删除；生成结果会存到 `runtime/generated/`，该目录已被 Git 忽略。

## 部署到手机

项目根目录的 `render.yaml` 已配置为新加坡区域的 Render Node Web Service，并包含健康检查和 MiniMax 服务端变量。部署步骤：

1. 把当前版本推送到 GitHub 仓库。
2. 在 Render 选择 **New → Blueprint** 并连接该仓库。
3. 创建服务时，在 `MINIMAX_API_KEY` 的安全输入框中填入 MiniMax 控制台创建的 Key。不要把 Key 写进 Git、前端代码或聊天消息。
4. 等待健康检查通过，Render 会分配一个 `https://…onrender.com` 域名。

手机用 Safari 或 Chrome 打开该 HTTPS 域名即可使用。iPhone 可点“分享 → 添加到主屏幕”，Android 可点浏览器菜单中的“安装应用”。项目包含 Web App Manifest、独立显示模式和离线应用壳；MiniMax 生成和分析功能仍需要联网。

Render 免费 Web Service 在一段时间无访问后会休眠，首次打开可能需要等待唤醒。`runtime/generated/` 使用实例临时磁盘，服务重启后生成图片可能消失；正式商用前应换成对象存储并补齐账户、隐私与内容审核能力。

接口：

- `GET /api/minimax/status`：检查图像与哭声特征推理是否配置。
- `POST /api/minimax/image`：接收用户明确同意上传的单张照片，调用 MiniMax `image-01`，保存并返回生成图。
- `POST /api/minimax/cry-analysis`：接收浏览器从 5 秒录音提取的响度序列，不上传原始音频，再调用 MiniMax 文本模型解释特征与照护上下文。

MiniMax 当前公开的 Chat Completions 不接收音频输入，语音 API 主要是语音合成。因此这里没有虚构“MiniMax 原生哭声识别”：现阶段采用“本机提取声学特征 + MiniMax 文本推理”，并继续保留危险体征问询、低置信度阻断和非诊断提示。若要做可用于正式产品的哭声分类，仍需接入经过验证的专用音频模型和医学/隐私合规流程。

## 已实现

- Launch Screen、三页 Onboarding、Apple 登录主入口和邮箱次入口
- 登录后的五栏 Tab Bar：`首页 / 时间线 / 设备 / 社区 / 我的`
- 原“洞察”完整并入时间线，通过“记录 / 洞察”分段切换查看事件与规律
- 首页支持禾禾/鑫鑫切换，对应更新头像、月龄、状态和个性化内容；快速记录改为规范线性插画图标
- 社区活动轮播、线性金刚区、搜索、主题筛选、双列瀑布流和两个“直播中”内容，其中一条为母婴产品直播
- 私密优先的“宝宝小记”，支持家庭可见、主动公开和可选写入家庭时间线
- 宝宝小记、拍照、相册与 AI 照片统一收进悬浮“+”创作入口
- AI 艺术照相馆可从相机/相册选择真实照片，经明确授权后调用 MiniMax 生成
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
- `src/community.js`：`BabyMoment / CommunityPost / AIArtworkJob` 的本地状态、可见范围与 MiniMax 作业生命周期
- `scripts/serve.js`：静态服务、MiniMax 图生图代理、声音特征推理代理和生成资产落盘
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

哭声结论仍是非医疗照护参考，不具备筛查或诊断能力。MiniMax 接口可以真实调用，但 API 可用不等于模型已经过婴儿哭声临床验证。智能家居行为可用于未来的 Personalized Comfort Policy，但不得直接作为医学诊断依据。任何正式产品都需要经过隐私、安全、临床和目标市场合规审核。
