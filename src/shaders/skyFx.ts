// Sky effects shared by the sky dome and the sea reflection (Shifat 10:37 PM 'reflection must'): aurora + rainbow as functions of a view direction.
export const SKY_T = { value: 0 };   // one clock for the sky dome and the sea, so the mirrored aurora moves with the real one
export const SKYFX_GLSL = `
vec3 auroraSky(vec3 dn, float uT, float ns){ vec3 ac=vec3(0.0); if(dn.y<=0.02) return ac;
  for(int k=0;k<7;k++){ if(float(k)>=ns) break; float fk=float(k)/(ns-1.0);float H=1.0+fk*2.2;vec2 p=dn.xz/dn.y*H;
    float fx=-5.2+0.22*p.x+1.6*sin(p.x*0.35+uT*0.02)+0.7*sin(p.x*0.83-uT*0.03)+0.3*sin(p.x*1.9+uT*0.05);
    float d=abs(p.y-fx);float w=(0.5+fk*1.2)*(1.0+length(p)*0.07);   /* far curtains spread wider -> no thin streaks near the horizon */
    float a=exp(-d*d/(w*w))*exp(-fk*2.0)*(0.55+0.45*sin(p.x*0.6+uT*0.04+fk))*(0.7+0.3*sin(p.x*2.3-uT*0.06))*(1.0-0.38*(1.0-smoothstep(8.0,18.0,length(p)))+0.38*(1.0-smoothstep(8.0,18.0,length(p)))*sin(p.x*5.1+sin(p.x*1.3+uT*0.05)*2.0)*sin(p.x*2.9-uT*0.03));   /* fine ray banding fades with distance (no fan streaks) */
    a*=smoothstep(26.0,8.0,length(p))*smoothstep(-16.0,-6.0,p.y+8.0);
    ac+=mix(mix(vec3(0.42,1.0,0.5),vec3(0.1,0.95,0.4),smoothstep(0.0,0.3,fk)),vec3(0.75,0.3,0.85)*0.95,smoothstep(0.35,0.9,fk))*a*(7.0/ns);}   /* ref /tmp/aur/4.jpg: bright yellow-green lower hem, pure green body, violet-pink fringe on top */
  return ac*0.8*smoothstep(0.03,0.17,dn.y); }
vec3 rainbowSky(vec3 dn3, vec3 sunV, float rain, float day){   /* rain = WEATHER.bow (Shifat Nov 2 10:17 PM 'rainbow comes after rain'): 0..1 envelope that only rises once a shower ends, see src/world/weather.tsx */
  float ra=acos(clamp(dot(dn3,-sunV),-1.0,1.0));float rw=clamp(rain,0.0,1.0)*day*smoothstep(-0.02,0.08,sunV.y)*smoothstep(0.0,0.05,dn3.y);
  if(rw<=0.001) return vec3(0.0);
  /* Shifat 11:29 PM 'more glow + more blur': gaussian colour bands (no triangle corners) wider than before, plus a wide warm-white glow around the bow */
  float u=(ra-0.695)/0.075;vec3 rc=exp(-pow((vec3(u)-vec3(0.85,0.5,0.15))/0.38,vec3(2.0)))*smoothstep(-0.6,0.3,u)*(1.0-smoothstep(0.7,1.6,u));
  float u2=(0.945-ra)/0.085;vec3 rc2=exp(-pow((vec3(u2)-vec3(0.85,0.5,0.15))/0.42,vec3(2.0)))*smoothstep(-0.6,0.3,u2)*(1.0-smoothstep(0.7,1.6,u2));
  vec3 glow=vec3(1.0,0.96,0.9)*(exp(-pow((ra-0.725)/0.075,2.0))*0.09+exp(-pow((ra-0.98)/0.09,2.0))*0.025);
  /* ref Wikimedia 'Femø - Rainbows over the sea': brightest and most saturated at the feet, fading toward the top; brighter sky inside the
     primary, a darker (Alexander's) band between the two bows; strength varies softly along the arc where the rain curtain is thicker */
  float el=mix(1.15,0.35,smoothstep(0.05,0.55,dn3.y)); float az=atan(dn3.x,dn3.z); float ptch=0.7+0.3*sin(az*3.1+1.7)*sin(az*1.3+0.4);
  vec3 ins=vec3(0.07,0.075,0.08)*smoothstep(0.35,0.69,ra)*(1.0-smoothstep(0.69,0.71,ra));
  float alex=smoothstep(0.74,0.78,ra)*(1.0-smoothstep(0.86,0.9,ra));
  return ((rc*0.4+rc2*0.1+glow)*el*ptch+ins*el-vec3(0.035)*alex*el)*rw*(1.0-smoothstep(0.75,1.0,dn3.y)); }

/* storm lightning (real photos: flash lights the cloud deck from inside near the horizon, a soft blurry bolt drops to the sea, the sea glows under it) */
vec3 lightningSky(vec3 dn, vec3 fd, float f){ if(f<0.002) return vec3(0.0); vec3 lc=vec3(0.78,0.84,1.0);
  float az=dot(normalize(dn.xz+1e-4),fd.xz), side=dn.x*fd.z-dn.z*fd.x;
  vec2 cq=dn.xz/(dn.y+0.12)*3.0; float mot=0.55+0.45*sin(cq.x*1.7+sin(cq.y*2.3))*sin(cq.y*1.3+sin(cq.x*1.9)); float glow=exp((az-1.0)*5.0)*exp(-max(dn.y-0.05,0.0)*5.0)*smoothstep(-0.02,0.05,dn.y)*(0.45+0.9*mot);
  float hy=clamp(dn.y/0.09,0.0,1.0); float jx=0.012*sin(hy*23.0+fd.x*40.0)+0.008*sin(hy*61.0+fd.z*17.0);
  float bolt=exp(-pow((side-jx)/0.0045,2.0))*step(0.0,az)*step(-0.002,dn.y)*(1.0-smoothstep(0.07,0.1,dn.y));
  float halo=exp(-pow((side-jx)/0.03,2.0))*step(0.0,az)*smoothstep(-0.01,0.02,dn.y)*(1.0-smoothstep(0.05,0.14,dn.y));
  return lc*f*(glow*2.2+bolt*1.8+halo*0.45+0.07); }
`;

// moon + a sparse star field as functions of a direction, so the sea can mirror them too (Shifat 10:59 PM 'everything must be reflected')
export const SKYFX2_GLSL = `
vec3 moonSky(vec3 dn, vec3 sunV){ float mg=max(dot(dn,-sunV),0.0); return vec3(0.8,0.87,1.0)*(pow(mg,260.0)*0.55+pow(mg,45.0)*0.24+pow(mg,7.0)*0.09)+vec3(0.92,0.95,1.0)*smoothstep(0.99952,0.99972,mg)*0.55; }   /* matches the sky moon (Shifat Nov 2 8:40 PM photo: smaller, softer, not blown out); rippled normals turn it into the glitter path */
vec3 starsLite(vec3 dn){ if(dn.y<0.06) return vec3(0.0); vec2 sp=dn.xz/(abs(dn.y)+0.2)*46.0; vec2 si=floor(sp),sf=fract(sp); float sh=fract(sin(dot(si,vec2(12.9898,78.233)))*43758.5);
  if(sh<=0.95) return vec3(0.0); vec2 so=vec2(fract(sh*91.7),fract(sh*57.3))*0.6+0.2; float dd=length(sf-so); return vec3(0.85,0.9,1.0)*smoothstep(0.18,0.0,dd)*mix(0.15,0.6,pow(fract(sh*29.7),4.0))*smoothstep(0.06,0.35,dn.y); }
`;

/* clouds shared by sky + sea */
export const CLOUD_GLSL = `
float cloudN(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.0-2.0*u);
 float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),
       c2=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
 return mix(mix(a,b,u.x),mix(c2,d,u.x),u.y);}
float cloudFbm(vec2 p){ p+=vec2(cloudN(p*0.5),cloudN(p*0.5+7.3))*0.9;   /* domain warp -> billowy cauliflower puffs */
 float f=0.0,a=0.55; for(int i=0;i<5;i++){ f+=a*cloudN(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=0.48; } return f; }
vec4 cloudSky(vec3 dn, vec3 sun, float t, float warm, float rain, vec3 hor){
  /* volumetric-look cumulus (Shifat 12:03 AM; refs Wikimedia 'White Cumulus Clouds against Blue Sky'): puffy domain-warped fbm, Beer-Lambert sunward tap + powder,
     forward-scatter glowing thin edges / silver lining; shared by the sky dome and the sea reflection (Shifat 12:14 AM 'Must reflect') */
  if(dn.y<=0.0) return vec4(0.0);
  float g=max(dot(dn,sun),0.0);
  vec2 cp=dn.xz/(dn.y+0.22)*0.7+vec2(t*0.006,t*0.002);
  vec2 sd2=normalize(sun.xz+vec2(1e-4))*0.14;
  float cl=smoothstep(0.25,0.75,cloudN(cp*0.32+11.0)); float f=cloudFbm(cp)+0.3*cl-0.12, f2=cloudFbm(cp+sd2)+0.3*cl-0.12;
  float cov=mix(0.56,0.44,rain);
  float er=(cloudN(cp*5.3+t*0.01)*0.6+cloudN(cp*11.0)*0.4)*0.16;   /* edge erosion -> cauliflower puff edges, soft */
  float d=smoothstep(cov,cov+0.2,f-er), d2=smoothstep(cov,cov+0.2,f2-er);
  float hz=smoothstep(0.0,0.16,dn.y);
  if(d<=0.001) return vec4(0.0);
  float d3=smoothstep(cov,cov+0.2,cloudFbm(cp*0.93)+0.3*cl-0.12-er);   /* cloud mass above this point (toward the zenith) -> we are in the lower part: darker, flatter grey base like real cumulus */
  float T=exp(-2.6*d2)*mix(1.0,0.55,d3*d), pw=1.0-exp(-3.0*d);
  float lit=clamp(T*mix(1.0,pw,0.6)*1.25,0.0,1.0);
  float ph=pow(g,6.0)*0.6+pow(g,40.0)*0.9;
  float sss=ph*(1.0-d)*1.6+ph*0.25;
  vec3 sunC=mix(vec3(1.0,0.98,0.94),vec3(1.0,0.66,0.42),warm);
  vec3 base=mix(vec3(0.5,0.56,0.68),vec3(0.42,0.36,0.46),warm);
  vec3 cc=mix(base,sunC*1.08,lit)+sunC*sss+hor*0.12*(1.0-lit);
  return vec4(cc,d*hz*0.95);
}
`;
