# WCAG contrast of "<fg> <bg> [label]" lines on stdin, e.g. echo "#15140F #FFD12E" | python3 contrast.py
import sys
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
for line in sys.stdin:
    p=line.split()
    if len(p)>=2: print(f"{p[0]} on {p[1]}: {cr(p[0],p[1]):.2f}", *p[2:])
