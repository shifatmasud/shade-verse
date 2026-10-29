#!/usr/bin/env python3
"""Shade Verse sound pass: offline build of the downloaded audio assets (numpy + ffmpeg).

- steps.ogg/.mp3  : footstep sprite cut from three CC0 freesound recordings (see public/audio/CREDITS.md)
- birds.ogg/.mp3  : 20 s seamless loop cut from a CC0 freesound forest recording
- music_*.ogg/.mp3: original score composed and synthesized here (additive saw strings, plucks, taiko, brass, formant choir,
                    synthetic convolution hall); two locked layers (explore / action) + a title theme. Loops wrap their reverb tails.
Everything else in the game (ambience beds, hero/enemy SFX) is synthesized in the browser by src/audio/synth.ts.

This is the session record used to make the shipped files, kept as-is so they can be regenerated or tweaked.
Inputs: the freesound HQ previews listed in CREDITS.md, saved as fs/<tag>_<id>.mp3 with a meta.json (tag -> file).
"""
import json, os, subprocess
W = os.environ.get('SV_AUDIO_WORK', '.')
OUT = os.environ.get('SV_AUDIO_OUT', 'public/audio')
meta = json.load(open(os.path.join(W, 'fs', 'meta.json')))
SR = 44100
import numpy as np, wave
def load(fn,sr=44100):
    r=subprocess.run(['ffmpeg','-v','error','-i',fn,'-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True)
    return np.frombuffer(r.stdout,dtype=np.float32).copy()
def env(x,sr=44100,win=0.01):
    n=int(sr*win); m=len(x)//n
    return np.sqrt((x[:m*n].reshape(m,n)**2).mean(1)+1e-12)
for tag,m in meta.items():
    x=load(m['file']); e=env(x)
    # band energy split
    X=np.abs(np.fft.rfft(x[:44100*8]))**2; f=np.fft.rfftfreq(min(len(x),44100*8),1/44100)
    lo=X[f<300].sum()/X.sum(); hi=X[f>3000].sum()/X.sum()
    print(tag, f"{len(x)/44100:.1f}s peak {20*np.log10(np.abs(x).max()+1e-9):.1f} rms {20*np.log10(np.sqrt((x**2).mean())):.1f} median-env {20*np.log10(np.median(e)):.1f} lo{lo:.2f} hi{hi:.2f}")

def onsets(x,sr=44100,minsep=0.28,thr_db=-22):
    e=env(x,sr,0.005); edb=20*np.log10(e); pk=edb.max()
    on=[];last=-1e9
    for i in range(1,len(edb)):
        if edb[i]>pk+thr_db and edb[i-1]<=pk+thr_db and (i-last)*0.005>minsep:
            on.append(i*0.005); last=i
    return on
steps={}
for tag in ['concrete','grass','sand']:
    x=load(meta[tag]['file']); o=onsets(x)
    segs=[]
    for t in o:
        a=int((t-0.015)*44100); b=a+int(0.26*44100)
        if a<0 or b>len(x): continue
        s=x[a:b].copy(); 
        segs.append((np.abs(s).max(), s, t))
    print(tag,len(o),[round(t,2) for t in o][:20])
    steps[tag]=segs

os.makedirs(OUT,exist_ok=True)
SR=44100
def fade(s,fi=0.003,fo=0.06):
    s=s.copy(); a=int(fi*SR); b=int(fo*SR)
    s[:a]*=np.linspace(0,1,a); s[-b:]*=np.linspace(1,0,b)**2; return s
def hp1(x,fc):  # simple FFT highpass (smooth)
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X*=1/(1+(fc/np.maximum(f,1))**4); return np.fft.irfft(X,len(x))
def lp1(x,fc):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X*=1/(1+(f/fc)**4); return np.fft.irfft(X,len(x))
sprite=[]; offs={}
SEG=0.32
for tag in ['concrete','grass','sand']:
    segs=sorted(steps[tag],key=lambda z:-z[0])
    pk=np.median([z[0] for z in segs])
    good=[z for z in segs if z[0]<pk*2.5][:4]
    for i,(p,s,t) in enumerate(good):
        x=load(meta[tag]['file']); a=int((t-0.012)*SR); s=x[a:a+int(SEG*SR)]
        s=hp1(s,70); s=s/np.abs(s).max()*0.7; s=fade(s,0.002,0.09)
        offs.setdefault(tag,[]).append(round(len(sprite)*SEG,3)); sprite.append(s)
    print(tag,len(good),offs[tag])
spr=np.concatenate(sprite).astype(np.float32)
def write(fn,x,sr=SR,stereo=False,q=3,mp3k=64):
    raw=f"{W}/tmp.f32"; x.astype(np.float32).tofile(raw)
    ch='2' if stereo else '1'
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac',ch,'-i',raw,'-c:a','libvorbis','-q:a',str(q),f"{OUT}/{fn}.ogg"],check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac',ch,'-i',raw,'-c:a','libmp3lame','-b:a',f"{mp3k}k",f"{OUT}/{fn}.mp3"],check=True)
    print(fn, os.path.getsize(f"{OUT}/{fn}.ogg"), os.path.getsize(f"{OUT}/{fn}.mp3"))
write('steps',spr,q=3,mp3k=64)
print(offs)

x=load(meta['birds2']['file'])
e=env(x,SR,0.5); print(np.round(20*np.log10(e),1))
def loopify(x,L,xf):
    # take L+xf samples, crossfade tail into head -> seamless loop of length L
    n=int(L*SR); k=int(xf*SR); y=x[:n+k].copy()
    w=np.sin(np.linspace(0,np.pi/2,k))**2
    out=y[:n].copy(); out[:k]=y[:k]*w+y[n:n+k]*(1-w); return out

b=hp1(x[int(1.0*SR):int(23.5*SR)],350)
b=loopify(b,20.0,2.0); b=b/np.sqrt((b**2).mean())*0.1; print(20*np.log10(np.abs(b).max()))
b=np.clip(b,-0.95,0.95)
write('birds',b,q=1,mp3k=48)
b=b/np.abs(b).max()*0.85
write('birds',b,q=0,mp3k=40)

rng=np.random.default_rng(7)
def note_hz(n): return 440*2**((n-69)/12)
NOTES={'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11}
def m(name):  # 'D4' -> midi
    import re
    p,o=re.match(r'([A-G][#b]?)(-?\d)',name).groups(); return 12*(int(o)+1)+NOTES[p]
def adsr(n,a,d,s,r,sr=SR):
    t=np.arange(n)/sr; dur=n/sr
    e=np.ones(n)*s
    ai=t<a; e[ai]=t[ai]/max(a,1e-4)
    di=(t>=a)&(t<a+d); e[di]=1-(1-s)*(t[di]-a)/max(d,1e-4)
    ri=t>dur-r; e[ri]*=np.clip((dur-t[ri])/max(r,1e-4),0,1)
    return e
def saw(f0,n,cut=3000,vib=0.0,vibf=5.0,detune=0.0,sr=SR,phase0=None,shape=1.0):
    t=np.arange(n)/sr
    f=f0*2**(detune/1200)*(1+vib*np.sin(2*np.pi*vibf*t+rng.uniform(0,6.28)))
    ph=2*np.pi*np.cumsum(f)/sr + (rng.uniform(0,6.28) if phase0 is None else phase0)
    K=int(min(cut*2.5, sr/2*0.9)/f0)
    out=np.zeros(n)
    for k in range(1,max(K,1)+1):
        a=(1/k**shape)/(1+(k*f0/cut)**2)
        out+=a*np.sin(k*ph)
    return out
def mk_ir(dur=2.8,pre=0.02,bright=0.5,sr=SR):
    n=int(dur*sr); t=np.arange(n)/sr
    ir=np.zeros((n,2))
    for ch in range(2):
        nz=rng.standard_normal(n)
        lo=lp1(nz,800); mid=lp1(hp1(nz,800),4000); hi=hp1(nz,4000)
        y=lo*np.exp(-t/(dur*0.38))+mid*np.exp(-t/(dur*0.25))*0.8+hi*np.exp(-t/(dur*0.12))*0.5*bright
        y[:int(pre*sr)]=0
        ir[:,ch]=y
    ir/=np.sqrt((ir**2).sum(0).max())
    return ir
def conv(x,ir):
    n=len(x)+len(ir)-1; N=1<<int(np.ceil(np.log2(n)))
    out=np.zeros((n,2))
    X=np.fft.rfft(x,N)
    for ch in range(2): out[:,ch]=np.fft.irfft(X*np.fft.rfft(ir[:,ch],N),N)[:n]
    return out
def pan(x,p):  # p -1..1 -> stereo
    a=(p+1)*np.pi/4; return np.stack([x*np.cos(a),x*np.sin(a)],1)
class Track:
    def __init__(s,L,tail=4.0): s.L=L; s.n=int(L*SR); s.buf=np.zeros((s.n+int(tail*SR),2)); s.wet=np.zeros_like(s.buf)
    def add(s,t,st,wet=0.3,dry=1.0):
        i=int(t*SR); j=min(i+len(st),len(s.buf)); st=st[:j-i]
        s.buf[i:j]+=st*dry; s.wet[i:j]+=st*wet
    def render(s,ir):
        r=conv(s.wet.mean(1)*1.0,ir)[:len(s.buf)]
        full=s.buf+r
        # wrap tail into head for seamless loop
        out=full[:s.n].copy(); tail=full[s.n:]; k=min(len(tail),s.n); out[:k]+=tail[:k]
        return out
print('ok')

import time
BPM=92; BEAT=60/BPM; BAR=4*BEAT; NB=8; LOOP=NB*BAR
chords=[['D3','F3','A3','D4'],['Bb2','F3','Bb3','D4'],['F2','C3','A3','F4'],['C3','G3','C4','E4'],
        ['D3','A3','D4','F4'],['Bb2','D3','F3','D4'],['G2','D3','Bb3','G4'],['A2','E3','C#4','E4']]
roots=['D2','Bb1','F2','C2','D2','Bb1','G1','A1']
t0=time.time()
IR=mk_ir(3.2,0.025,0.6)
# ---------- Layer A: calm ----------
A=Track(LOOP,4.0)
for bi,ch in enumerate(chords):
    st=bi*BAR; dur=BAR+0.9
    n=int(dur*SR)
    for vi,nn in enumerate(ch):
        f=note_hz(m(nn)); x=np.zeros(n)
        for d in (-7,0,6): x+=saw(f,n,cut=1400+vi*250,vib=0.0025,vibf=4.6+rng.uniform(-.4,.4),detune=d)
        x*=adsr(n,0.7,0.5,0.85,0.9)*0.022
        A.add(st,pan(x,[-0.5,-0.15,0.2,0.5][vi]),wet=0.55,dry=0.7)
    # low cello drone
    f=note_hz(m(roots[bi])+12); x=saw(f,n,cut=600,vib=0.002,shape=1.1)+saw(f,n,cut=600,detune=5)
    A.add(st,pan(x*adsr(n,0.5,0.4,0.9,0.9)*0.03,0),wet=0.35,dry=0.8)
# celesta-like motif: arpeggio plucks
def pluck(f,dur=1.6,bright=1.0):
    n=int(dur*SR); t=np.arange(n)/SR
    y=np.sin(2*np.pi*f*t)*np.exp(-t*2.2)+0.35*np.sin(2*np.pi*f*2.0*t)*np.exp(-t*4)+0.12*bright*np.sin(2*np.pi*f*4.01*t)*np.exp(-t*7)
    y*=np.minimum(1,t/0.004); return y
motif=[(0,'A4'),(1.5,'D5'),(2.5,'F5'),(3.5,'E5')]
mel=[['A4','D5','F5','E5'],['F4','Bb4','D5','C5'],['A4','C5','F5','E5'],['G4','C5','E5','D5'],['A4','D5','F5','A5'],['F4','Bb4','D5','F5'],['G4','Bb4','D5','C5'],['A4','C#5','E5','A4']]
for bi in range(NB):
    if bi%2==1 and bi not in (5,7): continue
    for (bt,_),nn in zip(motif,mel[bi]):
        A.add(bi*BAR+bt*BEAT,pan(pluck(note_hz(m(nn)))*0.05,rng.uniform(-0.4,0.4)),wet=0.7,dry=0.5)
outA=A.render(IR); print('A',time.time()-t0, np.abs(outA).max())

t0=time.time()
B=Track(LOOP,4.0)
def taiko(dur=1.2,f0=95,f1=48,v=1.0):
    n=int(dur*SR); t=np.arange(n)/SR
    f=f1+(f0-f1)*np.exp(-t*18); ph=2*np.pi*np.cumsum(f)/SR
    body=np.sin(ph)*np.exp(-t*4.2)
    slap=lp1(rng.standard_normal(n),1800)*np.exp(-t*38)*0.6
    skin=np.sin(2*np.pi*170*t)*np.exp(-t*14)*0.25
    y=(body+slap+skin)*v; y*=np.minimum(1,t/0.002); return y
def spic(f,dur=0.16):
    n=int(dur*SR); x=saw(f,n,cut=2200,detune=rng.uniform(-6,6))+saw(f,n,cut=2200,detune=rng.uniform(-6,6))
    t=np.arange(n)/SR; return x*np.minimum(1,t/0.006)*np.exp(-t*16)
def tick(dur=0.06):
    n=int(dur*SR); t=np.arange(n)/SR; return hp1(rng.standard_normal(n),5000)*np.exp(-t*60)
# ostinato 16ths: chord tones pattern
pat=[0,2,1,2, 0,2,1,3, 0,2,1,2, 0,3,1,2]
for bi,ch in enumerate(chords):
    tones=[m(ch[0])+12,m(ch[1])+12,m(ch[2])+12 if m(ch[2])<m('C4') else m(ch[2]),m(ch[3])]
    tones=[m(ch[0])+12, m(ch[1])+12, m(ch[0])+24, m(ch[1])+24]
    for k in range(16):
        acc=1.0 if k%4==0 else 0.7
        nt=tones[pat[k]]
        B.add(bi*BAR+k*BEAT/4,pan(spic(note_hz(nt))*0.03*acc,(-0.35 if k%2 else 0.35)),wet=0.3,dry=0.8)
    # taiko pattern: 1, 2&, 3, (4& on even bars)
    hits=[(0,1.0),(1.5,0.6),(2,0.85)]+([(3.5,0.5),(3.75,0.45)] if bi%2==1 else [])
    for bt,v in hits: B.add(bi*BAR+bt*BEAT,pan(taiko(v=v)*0.32,rng.uniform(-0.15,0.15)),wet=0.35,dry=0.9)
    # shaker ticks
    for k in range(16): B.add(bi*BAR+k*BEAT/4,pan(tick()*0.012*(1.0 if k%2 else 0.6),0.45),wet=0.2)
    # brass swell (root + fifth, low)
    n=int((BAR+0.3)*SR); t=np.arange(n)/SR
    for nn,pp in ((m(roots[bi])+12,-0.2),(m(roots[bi])+19,0.2)):
        f=note_hz(nn); cutenv=400+1400*np.clip(t/BAR,0,1)**1.5
        x=0
        for d in (-5,4):
            # approximate filter sweep: blend dark and bright versions
            dark=saw(f,n,cut=350,detune=d); bright=saw(f,n,cut=1800,detune=d)
            w=np.clip(t/BAR,0,1)**1.5; x=x+dark*(1-w)+bright*w
        x*=adsr(n,0.25,0.2,1.0,0.25)*(0.4+0.6*np.clip(t/BAR,0,1))*0.022
        B.add(bi*BAR,pan(x,pp),wet=0.45,dry=0.8)
# bar 8 drum roll build
for k in range(8): B.add(7*BAR+2*BEAT+k*BEAT/4,pan(taiko(0.6,120,60,v=0.3+0.08*k)*0.3,0),wet=0.4)
outB=B.render(IR); print('B',time.time()-t0,np.abs(outB).max())

sm=outA+outB; g=0.9/np.abs(sm).max(); print(g)
write('music_explore',(outA*g).astype(np.float32).reshape(-1),stereo=True,q=1,mp3k=80)
write('music_action',(outB*g).astype(np.float32).reshape(-1),stereo=True,q=1,mp3k=80)
mixdemo=(sm*g)

t0=time.time()
def formant(x,fs=((700,1.0,90),(1150,0.6,110),(2600,0.25,160))):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); H=np.zeros_like(f)
    for fc,a,bw in fs: H+=a/(1+((f-fc)/bw)**2)
    return np.fft.irfft(X*H,len(x))
TB=72; TBEAT=60/TB; TBAR=4*TBEAT; TL=8*TBAR
tch=[['D3','A3','D4','F4'],['Bb2','F3','Bb3','D4'],['G2','D3','G3','Bb3'],['A2','E3','A3','C#4'],
     ['D3','A3','D4','F4'],['F2','C3','F3','A3'],['C3','G3','C4','E4'],['A2','E3','A3','C#4']]
troots=['D2','Bb1','G1','A1','D2','F1','C2','A1']
T=Track(TL,5.0)
for bi,ch in enumerate(tch):
    n=int((TBAR+1.2)*SR)
    for vi,nn in enumerate(ch):
        f=note_hz(m(nn)); x=np.zeros(n)
        for d in (-8,0,7): x+=saw(f,n,cut=1200+vi*200,vib=0.003,vibf=4.4,detune=d)
        T.add(bi*TBAR,pan(x*adsr(n,1.1,0.6,0.85,1.2)*0.018,[-0.55,-0.2,0.2,0.55][vi]),wet=0.6,dry=0.6)
    # choir ah on upper two notes
    for nn,pp in ((ch[2],-0.3),(ch[3],0.3)):
        f=note_hz(m(nn)); x=sum(saw(f,n,cut=3500,vib=0.006,vibf=5.2+rng.uniform(-.5,.5),detune=d) for d in (-10,0,9))
        x=formant(x); T.add(bi*TBAR,pan(x*adsr(n,1.4,0.5,0.9,1.2)*0.045,pp),wet=0.75,dry=0.45)
    f=note_hz(m(troots[bi])+12); x=saw(f,n,cut=500,shape=1.1)+saw(f,n,cut=500,detune=6)
    T.add(bi*TBAR,pan(x*adsr(n,0.8,0.4,0.9,1.0)*0.035,0),wet=0.4,dry=0.8)
    # timpani on bar starts (soft), roll into bar 4 and 8
    T.add(bi*TBAR,pan(taiko(2.0,70,42,v=0.7 if bi in(0,4) else 0.4)*0.3,0),wet=0.5,dry=0.8)
    if bi in (3,7):
        for k in range(12): T.add(bi*TBAR+2*TBEAT+k*TBEAT/6,pan(taiko(0.8,75,45,v=0.15+0.04*k)*0.28,0),wet=0.5)
# heroic horn melody (bars 4..8)
hm=[(4,0,'D4',1.5),(4,1.5,'F4',0.5),(4,2,'A4',2),(5,0,'C5',1.5),(5,1.5,'A4',0.5),(5,2,'F4',2),(6,0,'G4',1.5),(6,1.5,'E4',0.5),(6,2,'C5',2),(7,0,'A4',3),(7,3,'E4',1)]
for bi,bt,nn,du in hm:
    f=note_hz(m(nn)); n=int((du*TBEAT+0.5)*SR); t=np.arange(n)/SR
    x=saw(f,n,cut=900,vib=0.004,vibf=5)+saw(f,n,cut=900,detune=6,vib=0.004)+0.5*saw(f/2,n,cut=600)
    x*=adsr(n,0.12,0.2,0.8,0.45)*0.045
    T.add(bi*TBAR+bt*TBEAT,pan(x,0.05),wet=0.5,dry=0.8)
# celesta intro bars 0-3
for bi in range(4):
    for (bt,_),nn in zip(motif,[['A4','D5','F5','E5'],['F4','Bb4','D5','C5'],['G4','Bb4','D5','D5'],['A4','C#5','E5','A5']][bi]):
        T.add(bi*TBAR+bt*TBEAT,pan(pluck(note_hz(m(nn)),2.2)*0.045,rng.uniform(-0.5,0.5)),wet=0.75,dry=0.4)
outT=T.render(mk_ir(4.0,0.03,0.5)); print(time.time()-t0,np.abs(outT).max())
outT*=0.85/np.abs(outT).max()
write('music_title',outT.astype(np.float32).reshape(-1),stereo=True,q=1,mp3k=80)