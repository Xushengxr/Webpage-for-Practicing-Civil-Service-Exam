from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
expected=json.loads((root/'scripts/bank-hashes.json').read_text())
for name,digest in expected.items():
    assert hashlib.sha256((root/'site/data'/name).read_bytes()).hexdigest()==digest, '题库构建与已验证版本不一致: '+name
report=json.loads((root/'site/题库导入报告.json').read_text())
assert report['distinctVariants']==28005
assert report['sourceQuestions']==58890
assert report['autoGradable']==27894
assert len(report['missingImages'])==2
assert sum(1 for p in (root/'site/images').rglob('*') if p.is_file())==39461
print('全部 257 个索引/题目文件与本地已验证版本一致；28,005 道题目版本、39,461 张图片。')
