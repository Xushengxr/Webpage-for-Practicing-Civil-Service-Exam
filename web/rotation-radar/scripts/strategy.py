"""创业板/中证红利三档月频轮动的纯计算逻辑。无网络依赖，便于单元测试。"""
from __future__ import annotations

from datetime import datetime

STRATEGY_ID = "cyb-dividend-fixed-v21-0375-0625"
GROWTH_LEVELS = (0.375, 0.325, 0.275)
DIVIDEND_LEVELS = (0.625, 0.675, 0.725)


def tier_count(ratio: float, side: str) -> int:
    if side == "growth":
        return sum(ratio < cut for cut in GROWTH_LEVELS)
    if side == "dividend":
        return sum(ratio > cut for cut in DIVIDEND_LEVELS)
    raise ValueError("side 必须是 growth 或 dividend")


def classify(ratio: float) -> str | None:
    if ratio < GROWTH_LEVELS[0]:
        return "growth"
    if ratio > DIVIDEND_LEVELS[0]:
        return "dividend"
    return None


def initial_state() -> dict:
    return {"direction": None, "cycle_side": None, "done": 0}


def apply_month_end(state: dict, ratio: float) -> tuple[dict, dict]:
    """将某月月末信号在【下一个交易日】执行。state 为执行前状态。

    注意：这里追踪的是理论档位，不代表用户实际已委托成交。
    资金/份额的计算需用户输入真实待转换持仓。
    """
    state = state.copy()
    target = classify(ratio)
    if target is None:
        state["cycle_side"] = None
        state["done"] = 0
        action = {"kind": "hold", "side": state["direction"], "new_tiers": 0,
                  "reached_tiers": 0, "previous_tiers": 0, "ratio": round(ratio, 6)}
        return state, action
    reached = tier_count(ratio, target)
    previous = state["done"] if state["cycle_side"] == target else 0
    new_tiers = max(0, reached - previous)
    state["cycle_side"] = target
    state["done"] = max(previous, reached)
    state["direction"] = target
    return state, {"kind": "rotate" if new_tiers else "hold", "side": target,
                   "new_tiers": new_tiers, "reached_tiers": reached,
                   "previous_tiers": previous, "ratio": round(ratio, 6)}


def summarize_history(daily: list[dict], sessions: list[str]) -> dict:
    """daily 行为 date,growth,dividend。交易日历显式提供，避免把未结束的月份当成月末。"""
    if not daily:
        raise ValueError("缺少行情数据")
    market_dates = {x["date"]: x for x in daily}
    calendar = sorted(set(sessions))
    if len(calendar) < 2:
        raise ValueError("交易日历不足")
    last = daily[-1]
    last_date = last["date"]
    calendar = [s for s in calendar if s >= daily[0]["date"]]
    months = {}
    for s in calendar:
        month = s[:7]
        months.setdefault(month, []).append(s)

    confirmed = []
    for month, days in sorted(months.items()):
        month_end = days[-1]
        if month_end > last_date:
            continue
        if month_end not in market_dates:
            raise ValueError(f"数据缺少已结束月份 {month} 的最后交易日 {month_end} 收盘，拒绝推算后续档位")
        next_open = next((s for s in calendar if s > month_end), None)
        x = market_dates[month_end]
        confirmed.append({"month": month, "month_end_date": month_end,
                          "execution_date": next_open,
                          "ratio": round(x["growth"] / x["dividend"], 6)})

    state = initial_state()
    events = []
    pending = None
    for item in confirmed:
        if item["execution_date"] and item["execution_date"] <= last_date:
            state, act = apply_month_end(state, item["ratio"])
            if act["new_tiers"] > 0:
                events.append({**item, **act})
        else:
            pending = item

    # 最新一个交易日的“若今天就是月末”的预判；若已经月末则为锁定信号。
    ratio = last["growth"] / last["dividend"]
    current_month = last_date[:7]
    this_month_end = months.get(current_month, [None])[-1]
    locked = this_month_end == last_date
    latest_month_signal = next((x for x in confirmed if x["month"] == current_month), None)
    tentative_state, forecast_action = apply_month_end(state, ratio)
    forecast = {
        "is_confirmed": bool(locked and latest_month_signal),
        "signal_month": current_month, "ratio": round(ratio, 6),
        "expected_execution": (latest_month_signal or {}).get("execution_date")
           if locked else next((s for s in calendar if s > (this_month_end or last_date)), None),
        **forecast_action,
        "monthly_buy_side": tentative_state["direction"],
        "active_cycle_done": state["done"],
        "active_cycle_side": state["cycle_side"],
    }
    return {
        "strategy": {"id": STRATEGY_ID, "lower": GROWTH_LEVELS[0], "upper": DIVIDEND_LEVELS[0],
                     "growth_levels": list(GROWTH_LEVELS), "dividend_levels": list(DIVIDEND_LEVELS)},
        "latest": {"date": last_date, "growth": round(last["growth"], 4),
                   "dividend": round(last["dividend"], 4), "ratio": round(ratio, 6)},
        "current_state": state,
        "forecast": forecast,
        "last_confirmed": confirmed[-1] if confirmed else None,
        "pending_confirmed": pending,
        "events": events[-18:],
        "last_monthly_signals": confirmed[-20:],
        "confirmed_count": len(confirmed),
    }
