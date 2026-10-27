import numpy as np,json
Q=np.load('Q1.npy').copy();Q[:,2]+=0.05;I=np.load('I1.npy');UV=np.load('UV1.npy')
h=json.load(open('/tmp/hero_cur.json'))
names=[b['n'] for b in h['bones']];par=[b['p'] for b in h['bones']]
J={b['n']:tuple(b['h']) for b in h['bones']}
tail={'hips':'spine','spine':'chest','chest':'neck','neck':'head','head':(0,1.97,0.05),'uarmL':'farmL','farmL':'handL','handL':(-0.49,0.80,0.05),
'thighL':'shinL','shinL':'footL','footL':(-0.14,0.03,0.30),'uarmR':'farmR','farmR':'handR','handR':(0.49,0.80,0.05),'thighR':'shinR','shinR':'footR','footR':(0.14,0.03,0.30)}
H=np.array([J[n] for n in names]);T=np.array([np.array(J[tail[n]] if isinstance(tail[n],str) else tail[n]) for n in names])
def segd(P,a,b):
    ab=b-a;t=np.clip(((P-a)@ab)/(ab@ab),0,1);return np.linalg.norm(P-(a+t[:,None]*ab),axis=1)
D=np.stack([segd(Q,H[i],T[i]) for i in range(17)],1)
# lateral constraint: arm bones only for |x|>0.17 when y>0.85; torso bones disallowed far out
x=np.abs(Q[:,0]);y=Q[:,1]
for i,n in enumerate(names):
    if n.startswith(('uarm','farm','hand')):
        D[:,i]+=np.where((x<0.19)&(y<1.5),1.0,0)+np.where(np.sign(Q[:,0])!=(-1 if n.endswith('L') else 1),1.0,0)
    if n in('hips','spine','chest') :
        D[:,i]+=np.where((x>0.27),0.6,0)
    if n.startswith(('thigh','shin','foot')):
        D[:,i]+=np.where(np.sign(Q[:,0])!=(-1 if n.endswith('L') else 1),0.5,0)+np.where(y>1.05,1.0,0)+np.where((x>0.31)&(y>0.7),1.0,0)
xc=np.interp(y,[0.7,0.96,1.22,1.55],[0.40,0.40,0.36,0.22])
armzone=(y<1.12)&(y>0.5)
for i,n in enumerate(names):
    if n.startswith(('uarm','farm','hand')):
        D[:,i]+=np.where(armzone&(x<xc-0.08),1.0,0)+np.where((y>=1.12)&(y<1.5)&(x<xc-0.2),1.0,0)
    if n in('hips','spine','chest'):
        D[:,i]+=np.where(armzone&(x>xc-0.02),1.0,0)+np.where((y>=1.12)&(y<1.5)&(x>xc+0.05),1.0,0)
band=(y>0.72)&(y<1.12)
for i,n in enumerate(names):
    if n.startswith(('uarm','farm','hand')):
        D[:,i]+=np.where(band&(x<0.27),3.0,0)
    else:
        D[:,i]+=np.where(band&(x>=0.27),3.0,0)
W=np.exp(-((D-D.min(1,keepdims=True))/0.085)**2)
top=np.argmax(W,1);isarm=np.isin(top,[5,6,7,11,12,13]);istor=np.isin(top,[0,1,2])
armb=[5,6,7,11,12,13];torb=[0,1,2]
for i in range(len(Q)):
    if armzone[i] and isarm[i]: W[i,torb]=0
    elif armzone[i] and istor[i]: W[i,armb]=0
armidx=[5,6,7,11,12,13]
wa=W[:,armidx].sum(1);wt=W.sum(1)-wa
low=y<1.3
for i in np.where(low)[0]:
    if wa[i]>=wt[i]: W[i,[k for k in range(17) if k not in armidx]]=0
    else: W[i,armidx]=0
cape=(Q[:,2]<-0.08)&(y>0.95)&(y<1.5)&(x<0.34)
W[np.ix_(np.where(cape)[0],armidx)]=0
z0=W.sum(1)==0
W[z0,2]=1
idx=np.argsort(-W,1)[:,:4];w=np.take_along_axis(W,idx,1);w=w/w.sum(1,keepdims=True);w=np.round(w,4);w=w/w.sum(1,keepdims=True)
w[w.sum(1)==0,0]=1
nrm=np.zeros_like(Q)
tri=Q[I];fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
for k in range(3):np.add.at(nrm,I[:,k],fn)
nrm/=np.maximum(np.linalg.norm(nrm,axis=1,keepdims=True),1e-9)
col=np.ones((len(Q),3))
out={'pos':np.round(Q,4).ravel().tolist(),'nor':np.round(nrm,3).ravel().tolist(),'col':np.round(col,3).ravel().tolist(),'uv':np.round(UV,5).ravel().tolist(),'idx':I.ravel().tolist(),'si':idx.ravel().tolist(),'sw':np.round(w,4).ravel().tolist(),'bones':[{'n':names[i],'p':par[i],'h':list(map(float,H[i]))} for i in range(17)]}
json.dump(out,open('/tmp/gem/base1_a.json','w'))
print(len(Q))
