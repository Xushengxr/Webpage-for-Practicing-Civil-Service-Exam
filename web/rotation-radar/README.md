# 轮动雷达 V2.1 · 创业板指 × 中证红利

独立地址（GitHub Pages）：<https://xushengxr.github.io/Webpage-for-Practicing-Civil-Service-Exam/rotation-radar/>

此目录只包含**创业板指399006 / 中证红利价格指数000922**的三档月频轮动网页版，不包含科创综指轮动策略。

- 创业板方向：`R < 0.40` / `< 0.35` / `< 0.30`
- 中证红利方向：`R > 0.60` / `> 0.65` / `> 0.70`
- 仅月末确认、下月首个交易日执行，每档为本轮初始锁定仓位的 1/3；中性区重置档位。
- 独立账户默认初始现金10万元、每月追加1000元。ETF价格与指数点位分开，交易只在用户核实券商成交后手工确认。
- 账户账本只保存在当前浏览器的 `localStorage`，没有证券账户接口，也**不会上传个人持仓到公开GitHub**。换设备要先导出JSON备份并自行导入。
- 默认ETF代码仅作示例；应确认是否适合自己的券商交易与指数需求。

**市场数据**：根目录 `.github/workflows/rotation-radar-update.yml` 每个交易日北京时间18:23/20:17尝试运行，更新 `web/rotation-radar/data/market.json`。网页优先从本仓库 GitHub Raw 地址直接拉取数据，所以 Actions 使用机器人提交行情时无需再次部署整个 Pages。GitHub Pages 自身可显示初始演示行情，但带 `demo: true` 的行情不能用作交易计划。

**旧数据安全**：任何行情抓取失败时更新脚本退出、不伪造今天行情；网页保留警告且禁用正式执行确认。指数收盘只用于比值信号，ETF报价只用于估值，ETF实际成交价以券商回报为准。

**本地测试**：`pip install -r requirements.txt`、`python -m pytest tests -q`、`node tests/test_portfolio_engine.cjs`；Python更新脚本 `python scripts/update_market.py`。

原来的“行测自习室”网站保留在同一GitHub Pages根目录，本页面仅占独立子路径。

风险提示：历史指数策略模型不等同实际ETF可实现收益；回撤可能很大，不保证盈利。
