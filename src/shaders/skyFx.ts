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
  float u=(ra-0.695)/0.065;vec3 rc=clamp(vec3(1.5-abs(u-0.85)*2.2,1.5-abs(u-0.5)*2.2,1.5-abs(u-0.15)*2.2),0.0,1.0)*smoothstep(-0.15,0.35,u)*(1.0-smoothstep(0.65,1.15,u));
  float u2=(0.945-ra)/0.07;vec3 rc2=clamp(vec3(1.5-abs(u2-0.85)*2.2,1.5-abs(u2-0.5)*2.2,1.5-abs(u2-0.15)*2.2),0.0,1.0)*smoothstep(-0.2,0.4,u2)*(1.0-smoothstep(0.6,1.2,u2));
  return (rc*0.32+rc2*0.1)*rw*(1.0-smoothstep(0.75,1.0,dn3.y)); }
`;
