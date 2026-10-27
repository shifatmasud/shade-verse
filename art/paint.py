import numpy as np
from PIL import Image,ImageFilter
pos=np.load('posmap.npy');fin=np.isfinite(pos[...,0])
im=np.array(Image.open('tex_orig.png').convert('RGB')).astype(float)/255
r,g,bl=im[...,0],im[...,1],im[...,2]
X,Y,Z=pos[...,0],pos[...,1],pos[...,2]
gold=fin&(r>0.45)&(g>0.3)&(bl<0.4)&(r>bl*1.6)
dia=gold&(np.abs(X)<0.075)&(Y>1.30)&(Y<1.55)&(Z>0.05)
pur=fin&(bl>0.35)&(r>0.2)&(g<0.35)&(bl>g*1.6)&(Y>1.7)&(Z>0.15)
def blur(m,rad=1.1):return np.array(Image.fromarray((m*255).astype('uint8')).filter(ImageFilter.GaussianBlur(rad))).astype(float)/255
def inpoly(px,py,poly):
    inside=np.zeros(px.shape,bool);n=len(poly)
    for a in range(n):
        x1,y1=poly[a];x2,y2=poly[(a+1)%n]
        c=((y1>py)!=(y2>py))&(px<(x2-x1)*(py-y1)/(y2-y1+1e-12)+x1);inside^=c
    return inside
out=im.copy()
suit=np.array([0.047,0.063,0.10]);GOLD=np.array([0.95,0.70,0.22]);face=np.array([0,0,0.024])
# clear old diamond (dilate by 2px to remove rim)
dm=blur(dia.astype(float),2.2)>0.05
out[dm&fin]=suit
# two-bolt logo
cx,cy,W,H=0.02,1.485,0.17,0.13
def mp(pts):return [(cx+(px-177)/185*W,cy-(py-167)/190*H) for px,py in pts]
top=mp([(85,165),(160,82),(270,72),(180,165)]);bot=mp([(90,262),(175,175),(270,172),(190,262)])
front=fin&(Z>0.05)
logo=(inpoly(X,Y,top)|inpoly(X,Y,bot))&front
lm=blur(logo.astype(float),0.9)
out=out*(1-lm[...,None])+GOLD*lm[...,None]
# lenses
pm=blur(pur.astype(float),2.0)>0.05
out[pm&fin]=face
ex=0.027;ey=1.777
for sx,tilt in((-1,-0.35),(1,0.35)):
    c=np.cos(tilt);s=np.sin(tilt);u=(X-(ex+sx*0.032))*c+(Y-ey)*s;v=-(X-(ex+sx*0.032))*s+(Y-ey)*c
    # almond: |v| < h*(1-(u/a)^2)
    a,h=0.027,0.0115
    inside=(np.abs(u)<a)&(np.abs(v)<h*(1-(u/a)**2)*1.0+0.0005)&fin&(Z>0.15)
    m=blur(inside.astype(float),0.8)
    core=blur(((np.abs(u)<a*0.55)&(np.abs(v)<h*0.45*(1-(u/(a*0.55))**2))&fin).astype(float),0.8)
    col=np.array([0.62,0.28,0.98])
    out=out*(1-m[...,None])+col*m[...,None]
    out=out*(1-core[...,None])+np.array([0.95,0.85,1.0])*core[...,None]
Image.fromarray((np.clip(out,0,1)*255).astype('uint8')).save('tex_new.png')
lift=np.clip(out**0.62*1.1,0,1);Image.fromarray((lift*255).astype('uint8')).save('tex_new_lift.png')
print('ok',logo.sum(),inside.sum())
