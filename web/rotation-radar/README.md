# 三指数60/40双策略轮动看板（2026-11-22）

在线入口：<https://xushengxr.github.io/Webpage-for-Practicing-Civil-Service-Exam/rotation-radar/>

## 当前首页

`index.html` 采用用户上传的深色三指数双策略模板，保留：

- A子策略：创业板指399006/中证红利000922，比值与阈值由用户调节（模板默认0.35/0.62）
- B子策略：恒生科技HSTECH/中证红利000922（模板默认0.65/0.85；尚非历史最优阈值结论）
- 初始资金按A/B 60%/40%分配；支持1至4次按月初调仓方案、合并三ETF目标、模拟回测与历史交易事件
- **我的轮换账户**：独立三ETF真实持仓账本，支持现金、代码、份额、ETF成交价格、手动入出金及买卖、导入导出JSON。浏览器本地存储键为 `rotationRadarDualPortfolioV1`，不会覆盖旧账户。用户须自行核对券商实际成交。

## 自动行情

- 原有A股更新：`scripts/update_market.py` → `data/market.json`，数据源和原V2.1算法未改
- 新增恒科更新：`scripts/update_hstech.py` → `data/hstech.json`。优先AKShare东方财富港股指数日线，失败时尝试新浪港股指数日线；只在数据校验通过时写入。失败保留前次文件并显示旧日期
- `.github/workflows/rotation-radar-update.yml` 在工作日北京时间18:23和20:17尝试抓取。网页从GitHub Raw优先读取，也有GitHub API备用地址。属于**收盘后批量更新**，并非盘中逐秒实时行情。
- A股和港股每日收盘日期可能不同，双比值最新信号使用两地最近**同一日期**的有效收盘；不存在同日价格时B账户仅作观察，并显示数据警告
- 历史月线以用户上传的2020-10以来月度资料为起点，由自动行情覆盖最近已完结月份；未完结月份不进入正式月度回测。点位价格指数不等于含分红ETF实盘收益

## 规则及安全界限

- 首页使用用户提供的“连续若干个月、每月初调一批”模型；模拟阈值可改，并不自动改写后台原V2.1三档信号
- 原V2.1策略是创业板与中证红利价格比值的三档阈值（0.375/0.325/0.275及0.625/0.675/0.725），且保留在 [旧版账本页面](./legacy.html)。`legacy.html` 的账本键 `rotationRadarPortfolioV21_0375_0625` 原封不动
- 之前的双指数新外观存放在 [上一版面板](./dashboard-before-dual.html)
- 首页“我的轮换账户”和上方假设资金/回测是**不同数据集**。只有保存了正确的现金、ETF份额与价格后，才会将实际估值同步到上方差额测算。指数收盘点位不能当成ETF单价
- 未月末确认的信号只是观察/演练。所有交易必须由用户核对实际ETF代码、份额、交易规则、可用资金和券商回报后自行执行
- 个人持仓保存在浏览器localStorage；浏览器缓存清理或换机可能丢失，请定期导出JSON备份。GitHub仓库公开文件内不包含个人持仓。
- ETF分红估算开关采用固定假设收益率，并非真实成分股股息再投数据；XIRR及最大回撤是模型估算，不能直接作为可实现净收益预测。

## 文件

- `index.html`、`dual-market-adapter.js`、`dual-account.js`：新版UI、行情适配、个人账本
- `portfolio-engine.js`、`dashboard-account.js`、`legacy.html`：保留原V2.1账本
- `data/market.json`、`data/hstech.json`：两组公开指数行情数据
- `scripts/update_market.py`、`scripts/update_hstech.py`：自动行情采集更新

本页面不提供自动交易接口，不保证收益。
