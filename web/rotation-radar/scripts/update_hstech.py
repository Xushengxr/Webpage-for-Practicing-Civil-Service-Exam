#!/usr/bin/env python3
"""独立更新恒生科技指数行情，不更改原创业板/中证红利计算与行情来源。

失败时不覆写旧 JSON，也不构造最新报价。请结合页面日期/来源判断可用性。
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "hstech.json"
CST = ZoneInfo("Asia/Shanghai")


def normalize(raw: pd.DataFrame) -> pd.DataFrame:
    names = {str(c).lower().strip(): c for c in raw.columns}
    date_col = names.get("date") or names.get("日期")
    price_col = names.get("close") or names.get("收盘") or names.get("latest") or names.get("最新价")
    if date_col is None or price_col is None:
        raise ValueError("恒生科技日线缺少日期或收盘列: " + repr(list(raw.columns)))
    df = raw[[date_col, price_col]].copy()
    df.columns = ["date", "close"]
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna()
    df = df.loc[(df.date >= "2020-07-27") & (df.close > 0)]
    df = df.drop_duplicates("date", keep="last").sort_values("date").reset_index(drop=True)
    if len(df) < 200 or df.date.iloc[0] > "2021-01-01":
        raise ValueError("恒生科技历史数据覆盖不足，拒绝替换")
    now = pd.Timestamp(datetime.now(CST).date())
    recent = pd.Timestamp(df.date.iloc[-1])
    if (now-recent).days > 16 or (recent-now).days > 1:
        raise ValueError(f"恒生科技收盘日期异常: {recent.date()}")
    if not 1000 < float(df.close.iloc[-1]) < 20000:
        raise ValueError("恒生科技收盘点位明显异常")
    return df


def fetch_history(ak):
    candidates = [
        ("AKShare/东方财富港股指数 index_hk_daily_em", lambda: ak.index_hk_daily_em(symbol="HSTECH")),
        ("AKShare/新浪港股指数 index_hk_daily_sina", lambda: ak.index_hk_daily_sina(symbol="HSTECH")),
    ]
    problems = []
    for name, fn in candidates:
        try:
            df = normalize(fn())
            # 历史交叉核验：新数据在2026年10月末应接近之前收集的该月收盘点位。
            october = df.loc[(df.date >= "2026-10-01") & (df.date <= "2026-10-31")]
            if not october.empty:
                check = float(october.close.iloc[-1])
                if abs(check / 3754.90 - 1) > 0.03:
                    raise ValueError("2026-10历史月末点位与既有档案偏差超过3%，拒绝混用")
            return df, name
        except Exception as e:
            problems.append(f"{name}: {e}")
            time.sleep(0.5)
    raise RuntimeError("恒生科技所有行情源失败: " + " | ".join(problems))


def update():
    import akshare as ak
    df, source = fetch_history(ak)
    today = datetime.now(CST).date().isoformat()
    this_month = today[:7]
    month_map = {}
    for row in df.itertuples(index=False):
        month_map[row.date[:7]] = {"month": row.date[:7], "date": row.date, "close": round(float(row.close), 4)}
    # 不把当月尚未完成的快照当成正式月K收盘。
    monthly = [row for month, row in sorted(month_map.items()) if month >= "2020-10" and month < this_month]
    if len(monthly) < 50:
        raise ValueError("已完成历史月线不足，拒绝覆盖")
    historical = [{"date": row.date, "close": round(float(row.close), 4)}
                  for row in df.tail(260).itertuples(index=False)]
    return {
        "series": "HSTECH", "latest": historical[-1], "monthly": monthly,
        "history": historical,
        "source": source, "verified_daily": True,
        "generated_at": datetime.now(CST).isoformat(timespec="seconds"),
        "notes": "港股交易日历与沪深不同。仅用两地同日的收盘价生成日度双指数比值；每月末使用两地各自最后交易日的收盘。指数点位不是ETF价格。"
    }


def main():
    try:
        data = update()
    except Exception as exc:
        print("警告：本次恒生科技更新未成功，保留上次已核实文件。原因：", exc)
        # A股原有数据更新必须继续；页面会以资料日期提示恒科过期。
        return
    tmp = OUTPUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUTPUT)
    print("恒生科技成功更新", data["latest"]["date"], data["latest"]["close"], "已完成月数", len(data["monthly"]))


if __name__ == "__main__":
    main()
