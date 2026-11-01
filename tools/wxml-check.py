# 轻量 WXML 结构检查：标签配对 + 明显的属性引号错误。
# 小程序编译器才会做完整校验，这个脚本只抓「手改 wxml 最容易犯的两类错」：
#   1. 多打一个 > （<view class="x">>）
#   2. 标签没闭合（<view> 数量与 </view> 对不上）
import io, glob, re, sys

VOID = {'image', 'input', 'switch', 'slider', 'canvas', 'icon', 'slot',
        'navigation-bar', 'progress', 'checkbox', 'radio', 'audio', 'video',
        'camera', 'textarea', 'map', 'web-view', 'ad', 'movable-view'}

TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(/?)>', re.S)

bad = 0
for f in sorted(glob.glob('**/*.wxml', recursive=True)):
    if 'node_modules' in f or f.startswith('dist'):
        continue
    s = io.open(f, encoding='utf-8').read()
    # 去掉注释，避免注释里的标签干扰
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)

    if re.search(r'">>', s) or re.search(r"'> >", s):
        print('[多处 >] %s' % f)
        bad += 1

    stack = []
    for m in TAG_RE.finditer(s):
        closing, name, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
        if selfclose or name in VOID:
            continue
        if closing:
            if not stack:
                print('[多余闭合] %s -> </%s>' % (f, name))
                bad += 1
                break
            top = stack.pop()
            if top != name:
                print('[交叉嵌套] %s -> 期望 </%s> 实际 </%s>（行内位置 %d）' % (f, top, name, m.start()))
                bad += 1
                break
        else:
            stack.append(name)
    if stack:
        print('[未闭合] %s -> %s' % (f, stack[-4:]))
        bad += 1
    # 属性引号成对（偶数个双引号）
    for line_no, line in enumerate(s.split('\n'), 1):
        if line.count('"') % 2 == 1 and '{{' not in line:
            print('[引号] %s:%d %s' % (f, line_no, line.strip()[:70]))
            bad += 1

print('--- 问题数:', bad)
sys.exit(1 if bad else 0)
