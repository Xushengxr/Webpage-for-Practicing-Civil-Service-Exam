import pathlib,re,json,hashlib,html,shutil,collections,sys
from html.parser import HTMLParser
sys.stdout.reconfigure(encoding='utf-8')
ROOT=pathlib.Path(__file__).resolve().parents[1]
SRC=pathlib.Path(sys.argv[sys.argv.index('--source')+1]) if '--source' in sys.argv else ROOT/'source-bank'
OUT=pathlib.Path(sys.argv[sys.argv.index('--out')+1]) if '--out' in sys.argv else ROOT/'site'
(OUT/'data').mkdir(parents=True,exist_ok=True)

class CleanHTML(HTMLParser):
    allowed={'p','br','img','u','span','b','strong','i','em','sub','sup','table','thead','tbody','tr','td','th','ul','ol','li','blockquote','code','pre'}
    def __init__(self):
        super().__init__(convert_charrefs=False);self.out=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','iframe','object'):self.skip+=1;return
        if self.skip or tag not in self.allowed:return
        a=dict(attrs);keep=[]
        if tag=='img':
            src=a.get('src','')
            if src.startswith('../90-图片/'):
                src='images/'+src[len('../90-图片/'):];keep.append(('src',src));keep.append(('alt','题目或公式图片'))
                if a.get('flag')=='tex':keep.append(('class','formula'))
                keep.append(('loading','lazy'))
            else:return
        if tag in ('td','th'):
            for k in ('colspan','rowspan'):
                if a.get(k,'').isdigit():keep.append((k,a[k]))
        self.out.append('<'+tag+''.join(' '+k+'="'+html.escape(v,quote=True)+'"' for k,v in keep)+'>')
    def handle_endtag(self,tag):
        if tag in ('script','style','iframe','object'):
            self.skip=max(0,self.skip-1);return
        if not self.skip and tag in self.allowed and tag not in ('img','br'):self.out.append('</'+tag+'>')
    def handle_data(self,data):
        if not self.skip:self.out.append(html.escape(data))
    def handle_entityref(self,name):
        if not self.skip:self.out.append('&'+name+';')
    def handle_charref(self,name):
        if not self.skip:self.out.append('&#'+name+';')

def render(text):
    text=text.strip()
    text=re.sub(r'!\[([^\]]*)\]\(([^)]+)\)',lambda m:'<img src="'+html.escape(m[2],quote=True)+'" />',text)
    text=re.sub(r'\*\*([^*\n]+)\*\*',r'<strong>\1</strong>',text)
    parser=CleanHTML();parser.feed(text);parser.close()
    return ''.join(parser.out)

heading=re.compile(r'^(#{2,3}) 第 (\d+) 题[^\n]*?<sub>qid (\d+) · (.*?)</sub>[^\n]*$',re.M)
material_head=re.compile(r'^## 材料 (\d+)\s*$',re.M)
option=re.compile(r'^- \*\*([A-H])\*\*\.\s*',re.M)
papers=[];paper_ids={};questions={};occurrences=0;declared_total=0;bad=[];by_module=collections.Counter();missing_imgs=set()
for folder in sorted(SRC.glob('0*')):
    if not folder.is_dir():continue
    for path in sorted(folder.glob('*.md')):
        if path.name=='README.md':continue
        text=path.read_text(encoding='utf-8-sig');meta={}
        for k,v in re.findall(r'^([^:\n]+):\s*"(.*)"\s*$',text.split('---',2)[1],re.M):meta[k]=v
        title=meta['试卷'];module=meta['模块'];year=meta['年份'];region=meta['地区']
        if title not in paper_ids:
            paper_ids[title]=len(papers);papers.append({'title':title,'year':year,'region':region})
        paper=paper_ids[title]
        matches=list(heading.finditer(text));expected=int(meta['题数']);declared_total+=expected
        if len(matches)!=expected:bad.append([str(path),expected,len(matches)])
        mats=list(material_head.finditer(text)); ended_materials=set()
        for i,m in enumerate(matches):
            end=matches[i+1].start() if i+1<len(matches) else len(text)
            next_mat=next((x for x in mats if m.end()<x.start()<end),None)
            if next_mat:end=next_mat.start()
            body=text[m.end():end].strip();body=re.sub(r'\n---\s*$','',body)
            ans_match=re.search(r'^\*\*答案\*\*：(.*)$',body,re.M)
            analysis_match=re.search(r'^\*\*官方解析\*\*\s*$',body,re.M)
            if not ans_match or not analysis_match:raise ValueError('缺少答案/解析 '+str(path)+' '+m[3])
            before=body[:ans_match.start()].strip();opts=list(option.finditer(before))
            stem=before[:opts[0].start()] if opts else before
            if not opts:stem=re.sub(r'^- （选项）.*$','',stem,flags=re.M)
            options=[]
            for j,o in enumerate(opts):
                raw=before[o.end():opts[j+1].start() if j+1<len(opts) else len(before)]
                options.append([o[1],render(raw.replace('✅','').strip())])
            answer=ans_match[1].strip();valid=bool(re.fullmatch('[A-H]+',answer)) and set(answer)<=set(x[0] for x in options)
            material=''
            prev=next((x for x in reversed(mats) if x.start()<m.start()),None)
            # The export leaves later independent questions under the last material.
            # A different question type or a self-contained long passage ends that group.
            if prev and module=='言语理解与表达':
                plain_stem=html.unescape(re.sub(r'<[^>]+>','',stem))
                if m[4]!='片段阅读' or len(plain_stem)>500:
                    ended_materials.add(prev.start())
            if prev and prev.start() not in ended_materials:
                first_q=next(x for x in matches if x.start()>prev.end())
                material=render(text[prev.end():first_q.start()])
            stem=render(stem);analysis=render(body[analysis_match.end():]);qid=m[3]
            digest=hashlib.sha256(json.dumps([stem,options,answer,material],ensure_ascii=False).encode()).hexdigest()[:12]
            identity=qid+'-'+digest
            source=[paper,module,m[4],int(m[2])]
            if identity not in questions:
                questions[identity]={'id':identity,'qid':qid,'stem':stem,'options':options,'answer':answer if valid else '', 'answerText':answer,'analysis':analysis,'material':material,'group':hashlib.sha256(material.encode()).hexdigest()[:16] if material else '', 'sources':[]}
            elif len(analysis)>len(questions[identity]['analysis']):questions[identity]['analysis']=analysis
            questions[identity]['sources'].append(source)
            occurrences+=1;by_module[module]+=1
            for src in re.findall(r'src="(images/[^\"]+)"',stem+analysis+material+''.join(x[1] for x in options)):
                if not (SRC/'90-图片'/src[len('images/'):]).exists():missing_imgs.add(src)
if bad:raise ValueError(json.dumps(bad,ensure_ascii=False))
assert occurrences==declared_total==58890
buckets=collections.defaultdict(list);index=[]
for q in questions.values():
    bucket=hashlib.sha256(q['id'].encode()).hexdigest()[:2]
    buckets[bucket].append({k:v for k,v in q.items() if k!='sources'})
    index.append([q['id'],bucket,q['sources'],bool(q['answer']),q['group']])
manifest={'version':1,'total':occurrences,'unique':len(questions),'qidCount':len(set(q['qid'] for q in questions.values())),'papers':papers,'index':index,'modules':list(by_module),'moduleCounts':by_module,'missingImages':sorted(missing_imgs)}
def jsdump(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
(OUT/'data'/'index.js').write_text('window.BANK_INDEX='+jsdump(manifest)+';',encoding='utf-8')
for bucket,items in buckets.items():
    (OUT/'data'/('q-'+bucket+'.js')).write_text('window.registerQuestions('+json.dumps(bucket)+','+jsdump(items)+');',encoding='utf-8')
(OUT/'images').mkdir(exist_ok=True)
if '--skip-images' not in sys.argv:
    shutil.copytree(SRC/'90-图片',OUT/'images',dirs_exist_ok=True)
report={'sourceQuestions':occurrences,'distinctVariants':len(questions),'distinctQids':manifest['qidCount'],'papers':len(papers),'autoGradable':sum(bool(q['answer']) for q in questions.values()),'manualOnly':sum(not q['answer'] for q in questions.values()),'missingImages':sorted(missing_imgs),'moduleCounts':by_module,'chunks':len(buckets)}
(OUT/'题库导入报告.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
