"""Склеивает сборку WIND_SINGLE (dist-single) в один index.html для программы."""
import glob, os, re, sys
src, out = sys.argv[1], sys.argv[2]
h = open(os.path.join(src, 'index.html'), encoding='utf-8').read()
js = open(glob.glob(os.path.join(src, 'assets', 'index-*.js'))[0], encoding='utf-8').read().replace('</script', '<\\/script')
css = open(glob.glob(os.path.join(src, 'assets', 'index-*.css'))[0], encoding='utf-8').read()
h = re.sub(r'<script[^>]*src="[^"]*\.js"[^>]*></script>', '', h)
h = re.sub(r'<link[^>]*href="[^"]*\.css"[^>]*>', lambda m: '<style>' + css + '</style>', h)
h = re.sub(r'<link[^>]*rel="(?:icon|manifest|apple-touch-icon)"[^>]*>', '', h)
i = h.rindex('</body>')
open(out, 'w', encoding='utf-8').write(h[:i] + '<script type="module">' + js + '</script>' + h[i:])
