"""仅针对ETF报价抓取的模拟单元测试，不联网。"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from update_market import get_etf_closes
import pandas as pd

class OK:
    def fund_etf_hist_em(self, **kwargs):
        return pd.DataFrame([{'日期':'2026-11-19','收盘':2.31},
                             {'日期':'2026-11-20','收盘':2.35}])

class PART:
    def fund_etf_hist_em(self, **kwargs):
        if kwargs['symbol']=='515080':raise RuntimeError('接口临时失败')
        return pd.DataFrame([{'日期':'2026-11-20','收盘':2.35}])


def test_success():
    r=get_etf_closes(OK(),'2026-11-20')
    assert r['growth']['symbol']=='159915' and r['growth']['date']=='2026-11-20'
    assert r['dividend']['symbol']=='515080' and r['growth']['close']==2.35


def test_partial_fail_safe():
    r=get_etf_closes(PART(),'2026-11-20')
    assert r['growth']['close']==2.35 and r['dividend'] is None


def test_stale_etf_fail_safe():
    r=get_etf_closes(OK(),'2026-11-23')
    assert r['growth'] is None and r['dividend'] is None
