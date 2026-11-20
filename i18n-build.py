# Сборка словарей языков: переводы построчно («номер<TAB>текст») -> wind-i18n-<код>.js.
# Запуск: python i18n-build.py <папка с tr-<код>.txt>
# Проверяет, что у каждого перевода тот же номер, что у ключа, и столько же #
# (числа подставляются по порядку — порядок # в переводе обязан совпадать).
import json, re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'wind-i18n-keys.js'), encoding='utf8').read()
keys = json.loads(src[src.index('['):src.rindex(']') + 1])
folder = sys.argv[1]
bad = 0
for f in sorted(os.listdir(folder)):
    m = re.fullmatch(r'tr-([a-z]{2})\.txt', f)
    if not m: continue
    code = m.group(1); tr = [None] * len(keys)
    for ln, line in enumerate(open(os.path.join(folder, f), encoding='utf8'), 1):
        line = line.rstrip('\n')
        if not line.strip(): continue
        i, _, t = line.partition('\t')
        i = int(i)
        if tr[i] is not None: print(f'{code}: строка {i} дважды'); bad += 1
        if t.count('#') != keys[i].count('#'):
            print(f'{code}: #{i} число # {t.count("#")} != {keys[i].count("#")}: {t}'); bad += 1
        tr[i] = t
    miss = [i for i, t in enumerate(tr) if t is None]
    if miss: print(f'{code}: нет переводов {len(miss)}: {miss[:12]}'); bad += 1
    with open(os.path.join(here, f'wind-i18n-{code}.js'), 'w', encoding='utf8', newline='\n') as o:
        o.write(f'// Перевод интерфейса: {code}. Порядок — как в wind-i18n-keys.js. Собран i18n-build.py.\n')
        o.write('export default ' + json.dumps([t or '' for t in tr], ensure_ascii=False, indent=0) + ';\n')
    print(code, 'ок', len(keys) - len(miss))
sys.exit(1 if bad else 0)
