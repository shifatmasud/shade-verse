// Sky effects shared by the sky dome and the sea reflection (Shifat 10:37 PM 'reflection must'): aurora + rainbow as functions of a view direction.
export const SKY_T = { value: 0 };   // one clock for the sky dome and the sea, so the mirrored aurora moves with the real one
export const SKYFX_GLSL = `
vec3 auroraSky(vec3 dn, float uT, float ns){ vec3 ac=vec3(0.0); if(dn.y<=0.02) return ac;
  for(int k=0;k<7;k++){ if(float(k)>=ns) break; float fk=float(k)/(ns-1.0);float H=1.0+fk*2.2;vec2 p=dn.xz/dn.y*H;
    float fx=-3.4+0.22*p.x+1.6*sin(p.x*0.35+uT*0.02)+0.7*sin(p.x*0.83-uT*0.03)+0.3*sin(p.x*1.9+uT*0.05);
    float d=abs(p.y-fx);float w=0.5+fk*1.2;
    float a=exp(-d*d/(w*w))*exp(-fk*2.6)*(0.55+0.45*sin(p.x*0.6+uT*0.04+fk))*(0.7+0.3*sin(p.x*2.3-uT*0.06))*(0.62+0.38*sin(p.x*5.1+sin(p.x*1.3+uT*0.05)*2.0)*sin(p.x*2.9-uT*0.03));
    a*=smoothstep(24.0,7.0,length(p))*smoothstep(-14.0,-4.0,p.y+8.0);
    ac+=mix(vec3(0.12,1.0,0.45),vec3(0.55,0.22,0.75),smoothstep(0.35,1.0,fk))*a*(7.0/ns);}
  return ac*0.6*smoothstep(0.05,0.24,dn.y); }
vec3 rainbowSky(vec3 dn3, vec3 sunV, float rain, float day){
  float ra=acos(clamp(dot(dn3,-sunV),-1.0,1.0));float rw=smoothstep(0.03,0.25,rain)*(1.0-smoothstep(0.55,0.85,rain))*day*smoothstep(-0.02,0.08,sunV.y)*smoothstep(0.0,0.05,dn3.y);
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
`;

// moon + a sparse star field as functions of a direction, so the sea can mirror them too (Shifat 10:59 PM 'everything must be reflected')
export const SKYFX2_GLSL = `
vec3 moonSky(vec3 dn, vec3 sunV){ float mg=max(dot(dn,-sunV),0.0); return vec3(0.82,0.88,1.0)*(pow(mg,260.0)*1.4+pow(mg,45.0)*0.5+pow(mg,7.0)*0.1)+vec3(0.95,0.97,1.0)*smoothstep(0.9988,0.9994,mg)*1.6; }   /* matches the sky moon (Gullmarn fjord photo); rippled normals turn it into the glitter path */
vec3 starsLite(vec3 dn){ if(dn.y<0.06) return vec3(0.0); vec2 sp=dn.xz/(abs(dn.y)+0.2)*46.0; vec2 si=floor(sp),sf=fract(sp); float sh=fract(sin(dot(si,vec2(12.9898,78.233)))*43758.5);
  if(sh<=0.95) return vec3(0.0); vec2 so=vec2(fract(sh*91.7),fract(sh*57.3))*0.6+0.2; float dd=length(sf-so); return vec3(0.85,0.9,1.0)*smoothstep(0.18,0.0,dd)*mix(0.15,0.6,pow(fract(sh*29.7),4.0))*smoothstep(0.06,0.35,dn.y); }
`;
