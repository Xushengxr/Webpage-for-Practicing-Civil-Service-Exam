import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from strategy import tier_count, classify, initial_state, apply_month_end, summarize_history


def test_tier_strict():
    assert tier_count(0.375, 'growth') == 0
    assert tier_count(0.37499, 'growth') == 1
    assert tier_count(0.32499, 'growth') == 2
    assert tier_count(0.27499, 'growth') == 3
    assert tier_count(0.625, 'dividend') == 0
    assert tier_count(0.626, 'dividend') == 1
    assert tier_count(0.676, 'dividend') == 2
    assert tier_count(0.726, 'dividend') == 3
    assert classify(0.375) is None
    assert classify(0.625) is None


def test_reset_cycle():
    s, a = apply_month_end(initial_state(), 0.37)
    assert a['new_tiers'] == 1 and s['direction'] == 'growth'
    s, a = apply_month_end(s, 0.31)
    assert a['new_tiers'] == 1 and s['done'] == 2
    s, a = apply_month_end(s, 0.36)
    assert a['new_tiers'] == 0 and s['done'] == 2
    s, a = apply_month_end(s, 0.51)
    assert a['new_tiers'] == 0 and s['direction'] == 'growth' and s['cycle_side'] is None
    s, a = apply_month_end(s, 0.27)
    assert a['new_tiers'] == 3 and s['done'] == 3
    s, a = apply_month_end(s, 0.70)
    assert a['new_tiers'] == 2 and s['direction'] == 'dividend'


def test_confirmed_not_inferred_from_partial_month():
    rows = [{'date':'2026-10-30','growth':2000,'dividend':4000},
            {'date':'2026-11-02','growth':1500,'dividend':4000},
            {'date':'2026-11-03','growth':1300,'dividend':4000}]
    cal = ['2026-10-30','2026-11-02','2026-11-03','2026-11-04','2026-11-30','2026-12-01']
    r=summarize_history(rows,cal)
    assert r['latest']['ratio']==0.325
    assert r['forecast']['is_confirmed'] is False
    assert r['forecast']['new_tiers']==1  # 0.3250 恰等于第二档阈值，不触发
    assert r['current_state']['direction'] is None


def test_month_end_confirmed_pending():
    rows = [{'date':'2026-10-30','growth':2000,'dividend':4000},
            {'date':'2026-11-02','growth':1500,'dividend':4000},
            {'date':'2026-11-30','growth':1450,'dividend':4000}]
    cal = ['2026-10-30','2026-11-02','2026-11-30','2026-12-01']
    r=summarize_history(rows,cal)
    assert r['forecast']['is_confirmed'] is True
    assert r['forecast']['new_tiers']==1
    assert r['forecast']['expected_execution']=='2026-12-01'
    assert r['strategy']['id'].endswith('0375-0625')


def test_missing_historical_month_end_is_error():
    import pytest
    rows = [{'date':'2026-10-29','growth':2000,'dividend':4000},
            {'date':'2026-11-02','growth':1400,'dividend':4000}]
    cal = ['2026-10-29','2026-10-30','2026-11-02','2026-11-30','2026-12-01']
    with pytest.raises(ValueError, match='最后交易日'):
        summarize_history(rows,cal)
