import { SKYFX_GLSL } from './skyFx';
// Sky dome shader (gradient, sun disc, clouds). Moved verbatim from Scene.tsx.
export const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`;
export const SKY_FS = `varying vec3 vDir;${SKYFX_GLSL}uniform vec3 uHor;uniform float uT;uniform vec3 uSunV;uniform float uDay;uniform float uWarm;uniform float uRain;uniform sampler2D uMoon;
float cloudN(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.0-2.0*u);
 float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),
       c2=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
 return mix(mix(a,b,u.x),mix(c2,d,u.x),u.y);}
float cloudFbm(vec2 p){ p+=vec2(cloudN(p*0.5),cloudN(p*0.5+7.3))*0.9;   /* domain warp -> billowy cauliflower puffs */
 float f=0.0,a=0.55; for(int i=0;i<5;i++){ f+=a*cloudN(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=0.56; } return f; }
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
 /* volumetric-look cumulus (Shifat 12:03 AM 'better volumetric clouds with subsurface scattering'; real refs Wikimedia 'White Cumulus Clouds against Blue Sky'):
    puffy domain-warped fbm on a curved layer; Beer-Lambert light toward the sun (2nd density tap offset sunward) + powder darkening for bright
    sunlit tops and soft grey-blue bases; subsurface/forward scattering (HG-like lobe) makes thin edges glow, silver lining when backlit;
    everything soft, fades into the horizon haze */
 if(vDir.y>0.0){
  vec3 dn=normalize(vDir);
  vec2 cp=dn.xz/(dn.y+0.22)*0.7+vec2(uT*0.006,uT*0.002);
  vec2 sd2=normalize(sun.xz+vec2(1e-4))*0.14;
  float cl=smoothstep(0.25,0.75,cloudN(cp*0.32+11.0)); float f=cloudFbm(cp)+0.3*cl-0.12, f2=cloudFbm(cp+sd2)+0.3*cl-0.12;   /* big-scale clustering -> separate puffs with blue gaps */
  float cov=mix(0.66,0.5,uRain);
  float d=smoothstep(cov,cov+0.16,f), d2=smoothstep(cov,cov+0.16,f2);
  float hz=smoothstep(0.0,0.16,dn.y);
  if(d>0.001){
   float T=exp(-2.6*d2), pw=1.0-exp(-3.0*d);
   float lit=clamp(T*mix(1.0,pw,0.6)*1.25,0.0,1.0);
   float ph=pow(g,6.0)*0.6+pow(g,40.0)*0.9;           /* forward-scattering lobe */
   float sss=ph*(1.0-d)*1.6+ph*0.25;                  /* thin edges glow brightest */
   vec3 sunC=mix(vec3(1.0,0.98,0.94),vec3(1.0,0.66,0.42),uWarm);
   vec3 base=mix(vec3(0.5,0.56,0.68),vec3(0.42,0.36,0.46),uWarm);
   vec3 cc=mix(base,sunC*1.08,lit)+sunC*sss+uHor*0.12*(1.0-lit);
   c=mix(c,cc,d*hz*0.95);
  }
 }
 {vec3 dn=normalize(vDir);vec3 nc=mix(vec3(0.07,0.08,0.19),vec3(0.012,0.02,0.07),smoothstep(0.0,0.6,dn.y));
  /* stars (Shifat 9:46 PM: varied sizes, sparse, subtle, clean): one jittered round point per lucky cell, anti-aliased by fwidth, size + brightness heavy-tailed so most are faint pinpricks and a few are bright; slow gentle twinkle */
  {vec2 sp=dn.xz/(abs(dn.y)+0.2)*46.0;vec2 si=floor(sp),sf=fract(sp);float sh=fract(sin(dot(si,vec2(12.9898,78.233)))*43758.5);
   if(sh>0.95){vec2 so=vec2(fract(sh*91.7),fract(sh*57.3))*0.6+0.2;float sz=fract(sh*13.1),sr=mix(0.035,0.12,sz*sz*sz),px=max(fwidth(sp.x),fwidth(sp.y));
    float rr2=max(sr,px*0.7),dd=length(sf-so);float sv=smoothstep(rr2,rr2*0.25,dd)*min(1.0,sr/rr2*1.6);
    float sb=mix(0.3,1.25,pow(fract(sh*29.7),4.0))*(0.8+0.2*sin(uT*(1.3+sz*2.0)+sh*60.0));
    nc+=mix(vec3(0.75,0.85,1.0),vec3(1.0,0.92,0.8),fract(sh*7.3))*sv*sb*3.2*smoothstep(0.06,0.35,dn.y);}}
  nc+=auroraSky(dn,uT,7.0);   /* aurora v3 - src/shaders/skyFx.ts (shared with the sea reflection) */
  float mg=max(dot(dn,-sun),0.0);   /* moon from a real photo (Wikimedia 'FullMoon2010', public/moon.png): the photographed disc in local tangent coords, soft anti-aliased limb,
     warmer when low (atmosphere), a tight bright halo plus a wide faint glow like the Gullmarn fjord photo */
   { vec3 md=-sun; vec3 mu=normalize(cross(md, abs(md.y)>0.98?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0))); vec3 mv=cross(mu,md); vec2 q=vec2(dot(dn,mu),dot(dn,mv))/0.036; float mr=length(q);
     float disc=(1.0-smoothstep(0.95,1.03,mr))*step(0.0,dot(dn,md)); vec3 tint=mix(vec3(1.0,0.82,0.62),vec3(1.0,0.98,0.94),smoothstep(0.0,0.35,md.y));
     float tx=texture2D(uMoon,clamp(q*0.5+0.5,0.0,1.0)).r; nc=mix(nc,tint*(0.25+1.25*pow(tx,1.15)),disc);
     nc+=vec3(0.75,0.85,1.0)*(pow(mg,90.0)*0.32+pow(mg,10.0)*0.06)*(1.0-disc); }
  c=mix(nc,c,uDay);}
 /* rain: low overcast deck - flat grey-blue, a little lighter toward the horizon, slow dark cloud mottling */
 if(uRain>0.001){vec3 dn2=normalize(vDir);vec2 rq=dn2.xz/(abs(dn2.y)+0.25)*2.2+vec2(uT*0.012,0.0);float rn=fract(sin(dot(floor(rq),vec2(127.1,311.7)))*43758.5);vec2 rf=fract(rq);rf=rf*rf*(3.0-2.0*rf);float rn2=mix(mix(rn,fract(sin(dot(floor(rq)+vec2(1,0),vec2(127.1,311.7)))*43758.5),rf.x),mix(fract(sin(dot(floor(rq)+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(floor(rq)+vec2(1,1),vec2(127.1,311.7)))*43758.5),rf.x),rf.y);
  vec3 oc=mix(uHor*1.05,uHor*0.72,smoothstep(0.0,0.5,dn2.y))*(0.9+0.2*rn2);c=mix(c,oc,uRain*0.92);}
 c+=rainbowSky(normalize(vDir),uSunV,uRain,uDay);   /* rainbow - src/shaders/skyFx.ts */
 gl_FragColor=vec4(c,1.0);
}`;
