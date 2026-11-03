import { SKYFX_GLSL, CLOUD_GLSL } from './skyFx';
// Sky dome shader (gradient, sun disc, clouds). Moved verbatim from Scene.tsx.
export const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`;
export const SKY_FS = `varying vec3 vDir;${SKYFX_GLSL}${CLOUD_GLSL}uniform vec3 uHor;uniform float uT;uniform vec3 uSunV;uniform float uDay;uniform float uWarm;uniform float uRain;uniform float uBow;uniform float uAur;uniform float uFlash;uniform vec3 uFd;uniform sampler2D uMoon;
float svh2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float svn2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(svh2(i),svh2(i+vec2(1,0)),f.x),mix(svh2(i+vec2(0,1)),svh2(i+vec2(1,1)),f.x),f.y);}
void main(){
 float t=clamp(vDir.y*1.6,0.0,1.0);
 vec3 top=mix(vec3(0.16,0.42,0.9),vec3(0.24,0.5,0.86),uWarm);vec3 mid=mix(vec3(0.6,0.8,0.96),vec3(0.96,0.72,0.68),uWarm);
 vec3 c=mix(uHor,mid,smoothstep(0.0,0.25,t));c=mix(c,top,smoothstep(0.2,0.9,t));
 vec3 sun=uSunV;float g=max(dot(normalize(vDir),sun),0.0);
 c+=mix(vec3(1.0,0.95,0.85),vec3(1.0,0.78,0.5),uWarm)*(pow(g,24.0)*0.45+pow(g,220.0)*0.9);
 { /* sun from real photos (Wikimedia 'Sunset over the North Sea'): a distinct round disc with limb darkening, white-hot core by day turning
     golden-orange and dimmer near the horizon, a tight corona hugging the limb; soft anti-aliased edge, bloom adds the glare */
    float sa=acos(clamp(g,-1.0,1.0))/0.05; float sd=1.0-smoothstep(0.8,1.12,sa); float mu=sqrt(max(1.0-sa*sa,0.0)); float limb=0.82+0.18*mu;
    vec3 core=mix(vec3(1.0,0.98,0.94)*3.2,vec3(1.0,0.72,0.4)*2.4,uWarm*uWarm); vec3 rim=mix(vec3(1.0,0.9,0.7)*1.6,vec3(1.0,0.48,0.18)*1.3,uWarm*uWarm);
    c=mix(c,mix(rim,core,limb)*limb*1.15,sd); c+=mix(vec3(1.0,0.9,0.75),vec3(1.0,0.55,0.25),uWarm)*exp(-max(sa-1.0,0.0)*1.6)*0.55; }
 c+=vec3(1.0,0.7,0.45)*0.28*uWarm*exp(-abs(vDir.y)*9.0)*(0.4+0.6*max(dot(normalize(vec3(vDir.x,0.0,vDir.z)),normalize(vec3(sun.x,0.0,sun.z))),0.0));
 {float ci=sin(vDir.x/(vDir.y+0.25)*3.0+uT*0.01)*0.5+0.5;c=mix(c,vec3(1.0,0.75,0.7),smoothstep(0.55,0.8,t)*smoothstep(0.7,1.0,ci)*0.18);}
 {vec2 st=floor(vDir.xz/(abs(vDir.y)+0.2)*90.0);float r=fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5);
 c+=vec3(1.0)*step(0.9965,r)*smoothstep(0.55,0.9,t)*0.5*(1.0-uDay);}   /* no stars in a daylight sky */
 { vec4 cs=cloudSky(normalize(vDir),sun,uT,uWarm,uRain,uHor); c=mix(c,cs.rgb,cs.a); }   /* clouds - src/shaders/skyFx.ts CLOUD_GLSL (shared with the sea) */
 if(uDay<0.9999){vec3 dn=normalize(vDir);vec3 nc=mix(vec3(0.07,0.08,0.19),vec3(0.012,0.02,0.07),smoothstep(0.0,0.6,dn.y));
  /* stars (Shifat 9:46 PM: varied sizes, sparse, subtle, clean): one jittered round point per lucky cell, anti-aliased by fwidth, size + brightness heavy-tailed so most are faint pinpricks and a few are bright; slow gentle twinkle */
  {vec2 sp=dn.xz/(abs(dn.y)+0.2)*46.0;vec2 si=floor(sp),sf=fract(sp);float sh=fract(sin(dot(si,vec2(12.9898,78.233)))*43758.5);
   if(sh>0.95){vec2 so=vec2(fract(sh*91.7),fract(sh*57.3))*0.6+0.2;float sz=fract(sh*13.1),sr=mix(0.035,0.12,sz*sz*sz),px=max(fwidth(sp.x),fwidth(sp.y));
    float rr2=max(sr,px*0.7),dd=length(sf-so);float sv=smoothstep(rr2,rr2*0.25,dd)*min(1.0,sr/rr2*1.6);
    float sb=mix(0.3,1.25,pow(fract(sh*29.7),4.0))*(0.8+0.2*sin(uT*(1.3+sz*2.0)+sh*60.0));
    nc+=mix(vec3(0.75,0.85,1.0),vec3(1.0,0.92,0.8),fract(sh*7.3))*sv*sb*3.2*smoothstep(0.06,0.35,dn.y);}}
  if(uAur>0.002) nc+=auroraSky(dn,uT,7.0)*uAur;   /* aurora v3 - src/shaders/skyFx.ts (shared with the sea reflection) */
  float mg=max(dot(dn,-sun),0.0);   /* moon (Shifat Nov 2 8:40 PM 'I want this moon', ref: his photo of a small moon glowing through thin cloud over the sea): a smaller
     photographed disc (Wikimedia 'FullMoon2010', public/moon.png) kept under white so its maria still read, a soft limb, warmer when low; thin cloud wisps drift
     past it in the moon's own tangent plane - they veil the disc a little and catch its light, so the milky corona and the wide halo pool in the wisps
     around it instead of a flat sticker glow; away from the moon the wisps fade out (no extra clouds elsewhere, aurora + stars untouched) */
   { vec3 md=-sun; vec3 mu=normalize(cross(md, abs(md.y)>0.98?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0))); vec3 mv=cross(mu,md); vec2 q=vec2(dot(dn,mu),dot(dn,mv))/0.026; float mr=length(q);
     float fr=step(0.0,dot(dn,md)); float disc=(1.0-smoothstep(0.82,1.06,mr))*fr; vec3 tint=mix(vec3(1.0,0.84,0.66),vec3(0.97,0.98,1.0),smoothstep(0.0,0.35,md.y));
     vec2 wq=q*0.12+vec2(uT*0.006,0.0); float w=svn2(wq*vec2(1.0,2.4))*0.55+svn2(wq*vec2(2.2,4.8)+3.7)*0.3+svn2(wq*vec2(4.6,9.0)+9.1)*0.15; w=smoothstep(0.36,0.78,w);
     float env=exp(-mr*0.09)*fr;   /* the wisps live only around the moon */
     nc=mix(nc,vec3(0.055,0.065,0.11),w*0.45*env);   /* unlit wisp undersides hide the stars behind them */
     float tx=texture2D(uMoon,clamp(q*0.5+0.5,0.0,1.0)).r; vec3 dcol=tint*(0.74+0.42*pow(tx,1.1)); dcol=mix(dcol,vec3(0.7,0.76,0.88),w*0.25);   /* veiled a little where a wisp crosses */
     nc=mix(nc,dcol,disc);
     float corona=exp(-max(mr-1.0,0.0)*0.85), halo=exp(-mr*0.17), wide=exp(-mr*0.06);
     nc+=vec3(0.74,0.81,0.96)*(corona*0.62+halo*0.24*(0.3+2.0*w)+wide*0.11*(0.3+1.6*w))*fr*(1.0-disc); }
  c=mix(nc,c,uDay);}
 /* rain: low overcast deck - flat grey-blue, a little lighter toward the horizon, slow dark cloud mottling */
 if(uRain>0.001){vec3 dn2=normalize(vDir);vec2 rq=dn2.xz/(abs(dn2.y)+0.25)*2.2+vec2(uT*0.012,0.0);float rn=fract(sin(dot(floor(rq),vec2(127.1,311.7)))*43758.5);vec2 rf=fract(rq);rf=rf*rf*(3.0-2.0*rf);float rn2=mix(mix(rn,fract(sin(dot(floor(rq)+vec2(1,0),vec2(127.1,311.7)))*43758.5),rf.x),mix(fract(sin(dot(floor(rq)+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(floor(rq)+vec2(1,1),vec2(127.1,311.7)))*43758.5),rf.x),rf.y);
  vec3 oc=mix(uHor*0.95,uHor*0.42,smoothstep(0.0,0.45,dn2.y))*(0.78+0.4*rn2);   /* storm deck (real lightning photos): dark slate overhead, lighter band at the horizon, heavier soft mottling */c=mix(c,oc,uRain*0.92);
  /* rain curtains (Shifat Nov 2 2:14 AM 'Next'; real photo 'Cumulonimbus praecipitatio, Kuhlungsborn'): soft dark veils hanging from the storm deck down to the sea horizon, in drifting patches, with faint slanted streaks */
  {vec2 hz=normalize(dn2.xz+1e-5);float pm=smoothstep(0.5,0.78,svn2(hz*0.42+vec2(uT*0.001,0.0))*0.7+svn2(hz*1.0+vec2(3.1,-uT*0.0007))*0.3);   /* noise on the horizon circle: no seam */
   float hh=smoothstep(0.26,0.04,dn2.y)*smoothstep(-0.06,0.0,dn2.y);float stk=0.75+0.25*svn2(hz*27.0+vec2(dn2.y*9.0-uT*0.06,0.0));
   c=mix(c,uHor*0.3,pm*hh*stk*0.7*smoothstep(0.3,0.8,uRain));}}
 c+=lightningSky(normalize(vDir),uFd,uFlash); c+=rainbowSky(normalize(vDir),uSunV,uBow,uDay);   /* rainbow - src/shaders/skyFx.ts */
 gl_FragColor=vec4(c,1.0);
}`;
