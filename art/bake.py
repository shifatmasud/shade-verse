import numpy as np
from PIL import Image
Q=np.load('Q1.npy').copy();Q[:,2]+=0.05;I=np.load('I1.npy');UV=np.load('UV1.npy')
N=1024;pos=np.full((N,N,3),np.nan);nz=np.zeros((N,N))
tri=Q[I];fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);fn/=np.maximum(np.linalg.norm(fn,axis=1,keepdims=True),1e-12)
for t in range(len(I)):
    uv=UV[I[t]]*N;mn=np.floor(uv.min(0)).astype(int);mx=np.ceil(uv.max(0)).astype(int)
    xs,ys=np.meshgrid(np.arange(max(mn[0],0),min(mx[0]+1,N)),np.arange(max(mn[1],0),min(mx[1]+1,N)))
    p=np.stack([xs.ravel()+0.5,ys.ravel()+0.5],1)
    a,b,c=uv;d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(d)<1e-9:continue
    l1=((b[1]-c[1])*(p[:,0]-c[0])+(c[0]-b[0])*(p[:,1]-c[1]))/d;l2=((c[1]-a[1])*(p[:,0]-c[0])+(a[0]-c[0])*(p[:,1]-c[1]))/d;l3=1-l1-l2
    m=(l1>=-0.02)&(l2>=-0.02)&(l3>=-0.02)
    if not m.any():continue
    P=l1[m,None]*tri[t,0]+l2[m,None]*tri[t,1]+l3[m,None]*tri[t,2]
    X=p[m].astype(int)[:,0]-0;Y=p[m].astype(int)[:,1]
    pos[Y-0,X]=P;nz[Y,X]=fn[t,2]
np.save('posmap.npy',pos);np.save('nzmap.npy',nz)
print(np.isfinite(pos[...,0]).mean())
