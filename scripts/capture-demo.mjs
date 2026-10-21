import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(moduleName.includes(':')?pathToFileURL(moduleName).href:moduleName);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:810},deviceScaleFactor:4/3});
await mkdir('outputs/demo',{recursive:true});
async function shot(id,title){
 await page.evaluate(title=>{document.getElementById('demo-label')?.remove();const el=document.createElement('div');el.id='demo-label';el.textContent='知序 · 开发版 / 未调用云端模型     '+title;el.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:999;pointer-events:none;background:#254d37;color:#e6efdf;padding:11px 24px;font:12px Microsoft YaHei;text-align:center;letter-spacing:1px;';document.body.append(el);},title);
 await page.screenshot({path:`outputs/demo/${id}.png`});
}
try{
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});await shot('01','证据、理解与复习的学习闭环');
 await page.getByRole('button',{name:'我的资料',exact:false}).first().click();await shot('02','课程资料库');
 await page.getByRole('button',{name:'导入资料',exact:true}).click();await page.getByRole('textbox',{name:'资料名称',exact:true}).fill('我的课程摘录');await page.getByRole('textbox',{name:'粘贴资料内容',exact:true}).fill('# 学习方法\n\n## 主动回忆\n阅读课程资料后，先合上资料，尝试用自己的话复述要点，再打开原文检查遗漏和误解。将不确定的主题整理为下一次复习任务，避免只凭熟悉感判断是否理解。');await shot('03','本机解析、粘贴笔记与图片核对入口');await page.getByRole('button',{name:'添加到资料库',exact:true}).click();
 await page.getByRole('button',{name:'证据问答',exact:true}).click();await page.getByRole('textbox',{name:'输入学习问题'}).fill('React 的状态快照是什么意思？');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.getByRole('heading',{name:'知序 · 原文检索'}).waitFor();await shot('04','真实检索请求与原文摘录');
 await page.locator('.citation-card').first().click();await shot('05','页码、位置与完整上下文');await page.keyboard.press('Escape');
 await page.getByRole('textbox',{name:'输入学习问题'}).fill('火星地表矿物的同位素测定方法');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.getByText('证据不足',{exact:true}).waitFor();await shot('06','资料外问题：明确提示证据不足');
 await page.getByRole('button',{name:'知识脉络',exact:true}).click();await shot('07','基于文档结构的知识浏览');
 await page.getByRole('button',{name:'学习诊断',exact:true}).click();await page.getByRole('button',{name:'开始第一组练习',exact:true}).click();await shot('08','资料对应练习与原文依据');
 for(const card of await page.locator('.quiz-card').all())await card.locator('.quiz-option').first().click();await page.getByRole('button',{name:'提交并生成复习任务'}).click();await page.getByRole('button',{name:'查看复习计划',exact:true}).click();await shot('09','错题自动进入可执行的复习任务');
 await page.getByRole('button',{name:'偏好设置',exact:true}).click();await page.getByText('学习数据由你掌控',{exact:true}).scrollIntoViewIfNeeded();await shot('10','资料范围、云端确认与学习备份');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'证据问答',exact:true}).click();await page.getByRole('textbox',{name:'输入学习问题'}).fill('React 的状态快照是什么意思？');await page.getByRole('button',{name:'发送问题',exact:true}).click();await page.getByRole('heading',{name:'知序 · 原文检索'}).waitFor();await page.getByText('查看执行记录',{exact:false}).click();await page.locator('.trace-details').scrollIntoViewIfNeeded();await shot('11','可检查的检索执行记录');
 await page.getByRole('button',{name:'学习工作台',exact:true}).click();await shot('12','开发版已实现：证据、验证与行动');
 console.log('12 real application screenshots captured at 1920x1080.');
}finally{await browser.close();}
