// Sky dome shader (gradient, sun disc, clouds). Moved verbatim from Scene.tsx.
export const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`;
export const SKY_FS = `varying vec3 vDir;uniform vec3 uHor;uniform float uT;uniform vec3 uSunV;uniform float uDay;uniform float uWarm;uniform float uRain;
void main(){
 float t=clamp(vDir.y*1.6,0.0,1.0);
 vec3 top=mix(vec3(0.16,0.42,0.9),vec3(0.24,0.5,0.86),uWarm);vec3 mid=mix(vec3(0.6,0.8,0.96),vec3(0.96,0.72,0.68),uWarm);
 vec3 c=mix(uHor,mid,smoothstep(0.0,0.25,t));c=mix(c,top,smoothstep(0.2,0.9,t));
 vec3 sun=uSunV;float g=max(dot(normalize(vDir),sun),0.0);
 c+=mix(vec3(1.0,0.95,0.85),vec3(1.0,0.78,0.5),uWarm)*(pow(g,24.0)*0.45+pow(g,220.0)*0.9);
 c=mix(c,vec3(1.0,0.93,0.75)*1.6,smoothstep(0.9975,0.9992,g));
 c+=vec3(1.0,0.7,0.45)*0.28*uWarm*exp(-abs(vDir.y)*9.0)*(0.4+0.6*max(dot(normalize(vec3(vDir.x,0.0,vDir.z)),normalize(vec3(sun.x,0.0,sun.z))),0.0));
 {float ci=sin(vDir.x/(vDir.y+0.25)*3.0+uT*0.01)*0.5+0.5;c=mix(c,vec3(1.0,0.75,0.7),smoothstep(0.55,0.8,t)*smoothstep(0.7,1.0,ci)*0.18);}
 {vec2 st=floor(vDir.xz/(abs(vDir.y)+0.2)*90.0);float r=fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5);
 c+=vec3(1.0)*step(0.9965,r)*smoothstep(0.55,0.9,t)*0.5;}
 // golden-hour cloud deck: 4-octave value noise on a projected plane, lit warm toward the sun, dark undersides
 if(vDir.y>0.02){
  vec2 cp=vDir.xz/(vDir.y+0.12)*1.6+vec2(uT*0.004,0.0);
  float f=0.0,a=0.5;vec2 q=cp;
  for(int i=0;i<4;i++){vec2 ip=floor(q),fp=fract(q);fp=fp*fp*(3.0-2.0*fp);
   float n=mix(mix(fract(sin(dot(ip,vec2(127.1,311.7)))*43758.5),fract(sin(dot(ip+vec2(1,0),vec2(127.1,311.7)))*43758.5),fp.x),mix(fract(sin(dot(ip+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(ip+vec2(1,1),vec2(127.1,311.7)))*43758.5),fp.x),fp.y);
   f+=n*a;a*=0.5;q=q*2.03+vec2(3.1,1.7);}
  float cov=smoothstep(0.5,0.78,f)*smoothstep(0.02,0.22,vDir.y);
  float sl=pow(max(dot(normalize(vDir),sun),0.0),3.0);
  vec3 cc=mix(vec3(0.42,0.3,0.42),vec3(1.0,0.72,0.58),0.35+0.65*sl);
  cc+=vec3(1.0,0.6,0.35)*pow(g,8.0)*0.4*(1.0-f);
  c=mix(c,cc,cov*0.85);
 }
 {vec3 dn=normalize(vDir);vec3 nc=mix(vec3(0.07,0.08,0.19),vec3(0.012,0.02,0.07),smoothstep(0.0,0.6,dn.y));
  /* stars (Shifat 9:46 PM: varied sizes, sparse, subtle, clean): one jittered round point per lucky cell, anti-aliased by fwidth, size + brightness heavy-tailed so most are faint pinpricks and a few are bright; slow gentle twinkle */
  {vec2 sp=dn.xz/(abs(dn.y)+0.2)*46.0;vec2 si=floor(sp),sf=fract(sp);float sh=fract(sin(dot(si,vec2(12.9898,78.233)))*43758.5);
   if(sh>0.95){vec2 so=vec2(fract(sh*91.7),fract(sh*57.3))*0.6+0.2;float sz=fract(sh*13.1),sr=mix(0.035,0.12,sz*sz*sz),px=max(fwidth(sp.x),fwidth(sp.y));
    float rr2=max(sr,px*0.7),dd=length(sf-so);float sv=smoothstep(rr2,rr2*0.25,dd)*min(1.0,sr/rr2*1.6);
    float sb=mix(0.3,1.25,pow(fract(sh*29.7),4.0))*(0.8+0.2*sin(uT*(1.3+sz*2.0)+sh*60.0));
    nc+=mix(vec3(0.75,0.85,1.0),vec3(1.0,0.92,0.8),fract(sh*7.3))*sv*sb*3.2*smoothstep(0.06,0.35,dn.y);}}
  /* aurora (Shifat 9:46 PM): soft drifting curtains in one band of the northern sky, green at the base fading to violet at the top, night only, faint */
  if(dn.y>0.06){vec2 ap=dn.xz/(dn.y+0.3);float ax=ap.x*0.9+sin(ap.y*1.3+uT*0.04)*0.8;
   float cu=0.5+0.5*sin(ax*5.0+sin(ax*1.7+uT*0.06)*2.5);cu*=0.55+0.45*sin(ax*19.0+uT*0.25+sin(ax*3.1)*2.0);
   float bd=smoothstep(-2.6,-1.5,ap.y)*(1.0-smoothstep(-0.9,0.2,ap.y));
   float hv=smoothstep(0.06,0.16,dn.y)*(1.0-smoothstep(0.3,0.62,dn.y));
   nc+=mix(vec3(0.12,0.95,0.55),vec3(0.55,0.25,0.85),smoothstep(0.16,0.5,dn.y))*cu*cu*bd*hv*0.16;}
  float mg=max(dot(dn,-sun),0.0);nc+=vec3(0.75,0.85,1.0)*(pow(mg,60.0)*0.25)+vec3(0.95,0.97,1.0)*smoothstep(0.9988,0.9994,mg)*1.2;
  c=mix(nc,c,uDay);}
 /* rain: low overcast deck - flat grey-blue, a little lighter toward the horizon, slow dark cloud mottling */
 if(uRain>0.001){vec3 dn2=normalize(vDir);vec2 rq=dn2.xz/(abs(dn2.y)+0.25)*2.2+vec2(uT*0.012,0.0);float rn=fract(sin(dot(floor(rq),vec2(127.1,311.7)))*43758.5);vec2 rf=fract(rq);rf=rf*rf*(3.0-2.0*rf);float rn2=mix(mix(rn,fract(sin(dot(floor(rq)+vec2(1,0),vec2(127.1,311.7)))*43758.5),rf.x),mix(fract(sin(dot(floor(rq)+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(floor(rq)+vec2(1,1),vec2(127.1,311.7)))*43758.5),rf.x),rf.y);
  vec3 oc=mix(uHor*1.05,uHor*0.72,smoothstep(0.0,0.5,dn2.y))*(0.9+0.2*rn2);c=mix(c,oc,uRain*0.92);}
 gl_FragColor=vec4(c,1.0);
}`;
