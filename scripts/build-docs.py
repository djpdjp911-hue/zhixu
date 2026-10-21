"""Build the development technical PDF from the tracked Markdown source.
Requires reportlab and pypdf. Uses an installed CJK font; no network assets.
"""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
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
    'h2': ParagraphStyle('h2', fontName='CJK', fontSize=12, leading=20, textColor=GREEN, spaceBefore=12, spaceAfter=7, wordWrap='CJK'),
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
    canvas.drawString(48, 805, '知序 ZHIXU  /  研究生组 · 技术文档开发稿')
    canvas.line(48, 43, 547, 43)
    canvas.drawString(48, 29, '开发版本 0.1.0  |  真实模型待联调  |  2026.10.21')
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
            table = Table(rows, colWidths=[290, 185], hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf3e7')),
                ('LINEBELOW', (0, 0), (-1, -1), .5, LINE),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            story += [table, Spacer(1, 13)]
            continue
        if line.startswith('# '):
            story.append(para(line[2:], 'cover' if section_index == 0 else 'h1'))
        elif line.startswith('## '):
            story.append(para(line[3:], 'h2'))
        elif line.startswith('- '):
            story.append(para('· ' + line[2:], 'list'))
        else:
            story.append(para(line))
        index += 1
    if section_index == 0:
        story.append(Spacer(1, 65))
        for item in ['01  资料与证据', '02  理解与验证', '03  复习与行动']:
            story.append(para(item, 'h2'))
        story.append(Spacer(1, 25))
        story.append(para('正式提交前须补充真实 API 实测、独立用户反馈与团队信息。'))

shot = ROOT / 'outputs' / 'dashboard-desktop.png'
if shot.exists():
    from PIL import Image as PILImage
    with PILImage.open(shot) as image:
        ratio = image.height / image.width
    story += [PageBreak(), para('附录 · 实际运行界面', 'h1'),
              para('以下为本地浏览器实际运行截图。初始学习足迹为零，示例讲义为项目原创。'),
              Spacer(1, 17), Image(str(shot), width=475, height=475 * ratio), Spacer(1, 20),
              para('完整操作包括问答、引用侧栏、资料外拒答、诊断到任务的闭环、自定义资料导入和备份恢复，见浏览器回归脚本。')]

target = OUT / '知序-技术文档-开发稿.pdf'
doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=60, leftMargin=60, topMargin=70, bottomMargin=62,
                        title='知序：证据驱动的课程学习工作台', author='知序项目', subject='传智杯研究生组技术文档开发稿')
doc.build(story, onFirstPage=furniture, onLaterPages=furniture)
reader = PdfReader(target)
assert len(reader.pages) <= 30
all_text = '\n'.join(page.extract_text() for page in reader.pages)
assert '检索评估' in all_text or '检索评' in all_text
assert '模型' in all_text and '开发稿' in all_text
print(f'PDF written: {target}; pages={len(reader.pages)}; extracted_chars={len(all_text)}')
