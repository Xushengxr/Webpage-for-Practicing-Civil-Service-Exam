#!/usr/bin/env python3
"""每日从公开指数日线源更新网站 JSON；失败时停止写入而不是伪造最新行情。"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
from strategy import summarize_history

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data' / 'market.json'
CHINA_TZ = ZoneInfo('Asia/Shanghai')


def normalize(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """统一多个 akshare 接口的日期与收盘价格字段。"""
    columns = {str(k).strip().lower(): k for k in df.columns}
    date_key = columns.get('date') or columns.get('日期') or columns.get('trade_date')
    close_key = columns.get('close') or columns.get('收盘')
    if date_key is None or close_key is None:
        raise ValueError(f'{label}: 收盘/日期字段缺失，接口列 {list(df.columns)}')
    t = df[[date_key, close_key]].copy()
    t.columns = ['date', label]
    t['date'] = pd.to_datetime(t['date'].astype(str), errors='coerce').dt.strftime('%Y-%m-%d')
    t[label] = pd.to_numeric(t[label], errors='coerce')
    t = t.dropna().loc[lambda x: x[label] > 0]
    t = t.drop_duplicates('date', keep='last').sort_values('date')
    if t.empty:
        raise ValueError(f'{label}: 没有可用日线')
    return t


def get_index_data(ak, label: str) -> tuple[pd.DataFrame, str]:
    if label == 'growth':
        methods = [
            ('东方财富深交所指数', lambda: ak.index_zh_daily_em(symbol='sz399006', start_date='20100101', end_date='20501231')),
            ('新浪深交所指数', lambda: ak.index_zh_daily_sina(symbol='sz399006')),
            ('东方财富通用指数', lambda: ak.index_zh_hist_em(symbol='399006', period='daily', start_date='20100101', end_date='20501231')),
        ]
    else:
        methods = [
            ('新浪中证红利指数（首选，避免东方财富限流）', lambda: ak.index_zh_daily_sina(symbol='sh000922')),
            ('东方财富中证指数', lambda: ak.index_zh_daily_em(symbol='csi000922', start_date='20100101', end_date='20501231')),
            ('东方财富沪市指数', lambda: ak.index_zh_daily_em(symbol='sh000922', start_date='20100101', end_date='20501231')),
            ('新浪中证红利指数', lambda: ak.index_zh_daily_sina(symbol='sh000922')),
            ('东方财富通用指数', lambda: ak.index_zh_hist_em(symbol='000922', period='daily', start_date='20100101', end_date='20501231')),
        ]
    errors = []
    for name, fn in methods:
        try:
            df = normalize(fn(), label)
            # 需要至少近一年数据，且数据不能落后太久。
            if len(df) < 120:
                raise ValueError(f'历史数据只有{len(df)}行')
            if df.iloc[0]['date'] > '2010-06-07':
                raise ValueError('历史数据未覆盖2010年6月，无法准确重建三档状态')
            last = pd.Timestamp(df.iloc[-1]['date'])
            now = pd.Timestamp(datetime.now(CHINA_TZ).date())
            if last > now + pd.Timedelta(days=1):
                raise ValueError('数据日期来自未来')
            if now - last > pd.Timedelta(days=16):
                raise ValueError(f'收盘数据过期：{last.date()}')
            print(f'{label}: 使用 {name}, {len(df)}行，最新交易日{last.date()}')
            return df, name
        except Exception as exc:
            errors.append(f'{name}: {exc}')
            time.sleep(0.6)
    raise RuntimeError('所有来源均失败：\n' + '\n'.join(errors))


def get_calendar(ak, latest: str, first: str) -> tuple[list[str], str]:
    minimum_future = (pd.Timestamp(latest).replace(day=1) + pd.DateOffset(months=1) + pd.Timedelta(days=12)).strftime('%Y-%m-%d')
    try:
        trade = ak.tool_trade_date_hist_sina()
        d = pd.to_datetime(trade['trade_date'], errors='coerce').dropna()
        s = sorted(set(d.dt.strftime('%Y-%m-%d')))
        if s and s[-1] >= minimum_future and s[0] <= first:
            return s, 'AKShare 股票交易日历'
    except Exception as exc:
        print(f'AKShare 交易日历不可用，尝试 XSHG：{exc}')

    import exchange_calendars as xcals
    cal = xcals.get_calendar('XSHG')
    if str(cal.last_session.date()) < minimum_future:
        raise RuntimeError(f'交易日历最多覆盖到{cal.last_session.date()}，无法核验下月首个交易日；请升级 exchange_calendars')
    if str(cal.first_session.date()) > first:
        raise RuntimeError('交易日历起始日过晚')
    s = [str(d.date()) for d in cal.sessions]
    return s, 'exchange_calendars XSHG'



def get_etf_closes(ak, market_date: str) -> dict:
    """默认示例ETF的收盘价，不复权，仅用于个人账本的估值与份额换算。

    失败不影响指数信号采集；单个ETF返回 null，并由网页要求手工填写。
    注意ETF指数标的≠ETF真实成交价，绝不把399006/000922点位填在这里。
    """
    result = {}
    for side, symbol in {'growth': '159915', 'dividend': '515080'}.items():
        try:
            fn = getattr(ak, 'fund_etf_hist_em')
            df = fn(symbol=symbol, period='daily',
                    start_date=(pd.Timestamp(market_date)-pd.Timedelta(days=80)).strftime('%Y%m%d'),
                    end_date=(pd.Timestamp(market_date)+pd.Timedelta(days=1)).strftime('%Y%m%d'), adjust='')
            df = normalize(df, 'etf')
            q = df.iloc[-1]
            if q['date'] != market_date:
                raise ValueError(f'ETF日期 {q["date"]} 与指数最近共同收盘日 {market_date} 不一致')
            result[side] = {'symbol': symbol, 'date': str(q['date']),
                            'close': float(q['etf']), 'source': 'AKShare fund_etf_hist_em 不复权收盘价'}
        except Exception as exc:
            print(f'ETF {symbol} 收盘价不可用，将要求用户手动输入：{exc}')
            result[side] = None
    return result


def update() -> dict:
    try:
        import akshare as ak
    except ImportError as exc:
        raise RuntimeError('缺少 akshare，请运行 pip install -r requirements.txt') from exc
    growth, src_g = get_index_data(ak, 'growth')
    dividend, src_r = get_index_data(ak, 'dividend')
    merged = growth.merge(dividend, on='date', how='inner')
    merged = merged.loc[merged.date >= '2010-06-01'].sort_values('date').reset_index(drop=True)
    if merged.empty:
        raise RuntimeError('两个指数没有可配对的交易日')
    if merged.iloc[0].date > '2010-06-07':
        raise RuntimeError('配对历史缺少2010年6月起始数据，拒绝推算档位')
    latest = merged.iloc[-1]
    if pd.Timestamp(datetime.now(CHINA_TZ).date()) - pd.Timestamp(latest.date) > pd.Timedelta(days=16):
        raise RuntimeError('两个行情源共同收盘日过旧，拒绝生成可交易提示')
    if not 0.15 <= float(latest.growth / latest.dividend) <= 1.5:
        raise RuntimeError('指数比值超出合理范围，请检查是否拉取错了指数/口径')
    # 两来源不一致时不将其外推为最近日收盘。
    if len(merged) < 120:
        raise RuntimeError('配对历史数据不足120日')
    daily = [
        {'date': row.date, 'growth': float(row.growth), 'dividend': float(row.dividend)}
        for row in merged.itertuples(index=False)
    ]
    cal, calendar_source = get_calendar(ak, latest.date, daily[0]['date'])
    calculated = summarize_history(daily, cal)
    calculated.update({
        'demo': False,
        'etf_closes': get_etf_closes(ak, latest.date),
        'generated_at': datetime.now(CHINA_TZ).isoformat(timespec='seconds'),
        'price_sources': {'growth': src_g, 'dividend': src_r},
        'calendar_source': calendar_source,
        'history': [
            {**r, 'ratio': round(r['growth'] / r['dividend'], 6)}
            for r in daily[-260:]
        ],
        'notes': '指数价格仅用于信号；ETF收盘价仅用于估值和数量预估。个人持仓仅保存于本地浏览器，不上传至GitHub；成交以券商回报为准。',
    })
    return calculated


def main() -> None:
    data = update()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(OUTPUT)
    print(f'成功更新：{OUTPUT}；{data["latest"]["date"]}；比值{data["latest"]["ratio"]:.4f}')


if __name__ == '__main__':
    main()
