# 把 after.html 里并排的手机拆成单屏文件，便于逐屏放大截图核对细节。
# 用法：python split.py
import re, os

SRC = os.path.join(os.path.dirname(__file__), 'after.html')
src = open(SRC, encoding='utf-8').read()

head = src[:src.index('<body>') + len('<body>')]
# 去掉用于单屏切换的 script（拆分后不需要）
head = head.replace('</head>', '</head>')

body_start = src.index('<body>') + len('<body>')
body_end = src.index('</body>')
body = src[body_start:body_end]

# 按 <div class="phone"> 切，逐字符平衡 div 标签
screens = []
i = 0
marker = '<div class="phone">'
while True:
    s = body.find(marker, i)
    if s < 0:
        break
    depth = 0
    j = s
    while j < len(body):
        if body.startswith('<div', j):
            depth += 1
            j += 4
        elif body.startswith('</div>', j):
            depth -= 1
            j += 6
            if depth == 0:
                break
        else:
            j += 1
    screens.append(body[s:j])
    i = j

print('found screens:', len(screens))
for n, blk in enumerate(screens, 1):
    html = head + '\n' + blk + '\n</body>\n</html>\n'
    out = os.path.join(os.path.dirname(__file__), 's%d.html' % n)
    open(out, 'w', encoding='utf-8').write(html)
    print('  ->', os.path.basename(out))
