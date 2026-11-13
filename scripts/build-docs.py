"""Build the development technical PDF from the tracked Markdown source.
Requires reportlab and pypdf. Uses an installed CJK font; no network assets.
"""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
font_candidates = [Path('C:/Windows/Fonts/msyh.ttc'), Path('/usr/share/fonts/truetype/arphic/uming.ttc')]
font_path = next((p for p in font_candidates if p.exists()), None)
if not font_path:
    raise SystemExit('Install a CJK TrueType font and update font_candidates.')
pdfmetrics.registerFont(TTFont('CJK', str(font_path), subfontIndex=0))
GREEN = colors.HexColor('#326447')
INK = colors.HexColor('#40533e')
MUTED = colors.HexColor('#7d8d73')
LINE = colors.HexColor('#e3eadb')
styles = {
    'h1': ParagraphStyle('h1', fontName='CJK', fontSize=23, leading=34, textColor=GREEN, spaceAfter=22, wordWrap='CJK'),
    'h2': ParagraphStyle('h2', fontName='CJK', fontSize=12, leading=20, textColor=GREEN, spaceBefore=12, spaceAfter=7, wordWrap='CJK', keepWithNext=1),
    'p': ParagraphStyle('p', fontName='CJK', fontSize=9.2, leading=17.5, textColor=INK, spaceAfter=9, wordWrap='CJK'),
    'list': ParagraphStyle('list', fontName='CJK', fontSize=9.2, leading=17.5, textColor=INK, leftIndent=11, firstLineIndent=-9, spaceAfter=6, wordWrap='CJK'),
    'cell': ParagraphStyle('cell', fontName='CJK', fontSize=9, leading=16, textColor=INK, wordWrap='CJK'),
    'cover': ParagraphStyle('cover', fontName='CJK', fontSize=34, leading=48, textColor=GREEN, spaceAfter=13),
}

def para(text, kind='p'):
    text = escape(text).replace(' -&gt; ', ' → ')
    return Paragraph(text, styles[kind])

def furniture(canvas, doc):
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(.6)
    canvas.line(48, 792, 547, 792)
    canvas.setFont('CJK', 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(48, 805, '知序 ZHIXU  /  研究生组 · 技术文档')
    canvas.line(48, 43, 547, 43)
    canvas.drawString(48, 29, '版本 0.2.0  |  福建农林大学 · 天选之子~  |  2026.10.26')
    canvas.drawRightString(547, 29, str(doc.page))

text = (ROOT / 'docs' / '技术文档.md').read_text(encoding='utf-8')
story = []
for section_index, section in enumerate(text.split('<!-- page -->')):
    if section_index:
        story.append(PageBreak())
    else:
        story.append(Spacer(1, 32))
    lines = section.strip().splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith('|'):
            rows = []
            while index < len(lines) and lines[index].strip().startswith('|'):
                cells = [c.strip() for c in lines[index].strip().strip('|').split('|')]
                if not all(re.match(r'^:?-+:?$', c) for c in cells):
                    rows.append([para(c, 'cell') for c in cells])
                index += 1
            table = Table(rows, colWidths=[135, 340], hAlign='LEFT', repeatRows=1)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf3e7')),
                ('LINEBELOW', (0, 0), (-1, -1), .5, LINE),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            if len(rows) <= 10:
                # keepWithNext does not reach into a KeepTogether, so move the heading and lead-in inside it.
                lead = []
                while story and isinstance(story[-1], Paragraph) and story[-1].getKeepWithNext():
                    lead.insert(0, story.pop())
                table = KeepTogether(lead + [table])
            story += [table, Spacer(1, 13)]
            continue
        if line.startswith('# '):
            story.append(para(line[2:], 'cover' if section_index == 0 else 'h1'))
        elif line.startswith('## '):
            story.append(para(line[3:], 'h2'))
        elif line.startswith('- '):
            story.append(para('· ' + line[2:], 'list'))
        else:
            paragraph = para(line)
            # A sentence ending in a colon introduces the table or list below it.
            if line.endswith('：'):
                paragraph.keepWithNext = 1
            story.append(paragraph)
        index += 1
    if section_index == 0:
        story.append(Spacer(1, 65))
        for item in ['01  有据问答 · Agent 与逐句核验', '02  理解检验 · AI 出题与费曼复述', '03  间隔复习 · 让理解留下来']:
            story.append(para(item, 'h2'))
        story.append(Spacer(1, 25))
        story.append(para('福建农林大学 · 天选之子~。'))

SHOTS = ROOT / 'outputs'


def figure(path, width, max_height):
    from PIL import Image as PILImage
    with PILImage.open(path) as image:
        ratio = image.height / image.width
    if width * ratio > max_height:
        width = max_height / ratio
    return Image(str(path), width=width, height=width * ratio)


desktop = [('dashboard-desktop.png', '图 1  学习工作台（桌面端）'),
           ('ai-answer-desktop.png', '图 2  AI 学习助手回答：引用、补充示例、自检问题与逐句核验（DeepSeek deepseek-flash）'),
           ('feynman-desktop.png', '图 3  费曼复述评估：指出故意写入的错误并给出逐字核对的原文依据')]
desktop = [(SHOTS / name, caption) for name, caption in desktop if (SHOTS / name).exists()]
if desktop:
    story += [PageBreak(), para('附录 · 实际运行界面', 'h1'),
              para('以下均为本地浏览器实际运行截图，AI 内容由真实模型生成，示例讲义为项目原创。')]
    for index, (path, caption) in enumerate(desktop):
        if index == 1:
            story.append(PageBreak())
        story += [Spacer(1, 10), figure(path, 475, 295 if index else 560), Spacer(1, 8), para(caption, 'cell')]
mobile = [SHOTS / 'mobile' / name for name in ['10-answer-code.png', '04-graph.png']]
if all(p.exists() for p in mobile):
    row = Table([[figure(p, 220, 520) for p in mobile]], colWidths=[237, 237], hAlign='LEFT')
    row.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    story += [PageBreak(), row, Spacer(1, 8),
              para('图 4  390px 手机视口：AI 回答中的代码块与提示框；知识图默认居中，可横向滑动', 'cell')]

target = OUT / '知序-技术文档.pdf'
doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=60, leftMargin=60, topMargin=70, bottomMargin=62,
                        title='知序：证据驱动的课程学习工作台', author='杜佳鹏', subject='传智杯研究生组技术文档')
doc.build(story, onFirstPage=furniture, onLaterPages=furniture)
reader = PdfReader(target)
assert len(reader.pages) <= 30
all_text = '\n'.join(page.extract_text() for page in reader.pages)
assert '检索评估' in all_text or '检索评' in all_text
assert '模型' in all_text and '天选之子' in all_text and '福建农林大学' in all_text
assert '开发稿' not in all_text and '待填写' not in all_text
assert '后续工作' not in all_text and 'boxuegu.com' not in all_text and '仍在收集' not in all_text
print(f'PDF written: {target}; pages={len(reader.pages)}; extracted_chars={len(all_text)}')
