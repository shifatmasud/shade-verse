// City buildings shader (vertex-colour facades, lit windows). Moved verbatim from Scene.tsx.
export const CITY_VS = `attribute vec3 aCol;attribute float aSeed;
varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
void main(){vPos=position;vNor=normal;vCol=aCol;vSeed=aSeed;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`;
export const CITY_FS = `varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
uniform vec3 uFog;uniform float uTime;uniform vec3 uSunV;uniform float uDay;uniform float uNoon;
void main(){
 if(vSeed>10.0)discard;
 vec3 n=normalize(vNor);
 vec3 L=normalize(mix(-uSunV,uSunV,step(0.0,uSunV.y))*vec3(1.0,1.0,1.0)+vec3(0.0,0.35,0.0));
 float d=max(dot(n,L),0.0);
 vec3 lit=mix(vec3(0.2,0.24,0.42)+vec3(0.5,0.6,0.95)*d*0.3,vec3(0.62,0.6,0.64)+vec3(1.0,0.84,0.62)*d*0.8*(1.0-0.45*uNoon),uDay);
 vec3 col=vCol*lit;
 if(abs(n.y)<0.5&&vPos.y>0.01&&vSeed<1.5){
  float u=abs(n.x)>0.5?vPos.z:vPos.x;float v=vPos.y;
  vec2 c=vec2(u/2.4,v/3.4);vec2 f=fract(c);vec2 id=floor(c);
  vec2 fwd=fwidth(c);float fa=clamp(max(fwd.x,fwd.y)*1.5,0.0,0.5);
  float w=smoothstep(0.22-fa,0.22+fa+0.001,f.x)*(1.0-smoothstep(0.78-fa,0.78+fa+0.001,f.x))*smoothstep(0.26-fa,0.26+fa+0.001,f.y)*(1.0-smoothstep(0.74-fa,0.74+fa+0.001,f.y))*step(4.0,v);
  vec2 hh=fract((id+floor(vSeed*2048.0+0.5)/2048.0*41.0)*vec2(0.1031,0.1030));hh+=dot(hh,hh.yx+33.33);float h=fract((hh.x+hh.y)*hh.x);
  float on=step(mix(0.3,0.62,uDay),h);
  float onA=mix(on,0.5,smoothstep(0.25,0.5,max(fwd.x,fwd.y)));
  vec3 wc=mix(vec3(0.27,0.38,0.52)*(0.6+0.8*f.y),vec3(0.95,0.74,0.46)*(0.55+0.45*h)*(1.0+0.9*(1.0-uDay)),onA);
  col*=0.82+0.18*step(0.12,f.y);col*=1.0-0.22*step(f.y,0.08)-0.12*step(f.x,0.06);
  col=mix(col,wc+vec3(0.12,0.1,0.2)*(1.0-onA)*d,w);
 }
 if(vSeed>1.5){col=vCol*1.25;}
 if(vPos.y<0.01&&vPos.x>100.0&&vPos.x<260.0&&vPos.z>20.0&&vPos.z<180.0)discard;   // valley: the park floor mesh replaces the street slab here
 if(vPos.y<0.01){
  col=vec3(0.26,0.27,0.31);
  float fx=abs(mod(vPos.x,40.0)-20.0);float fz=abs(mod(vPos.z,40.0)-20.0);
  float dash=step(2.0,mod(vPos.z,4.0));float dash2=step(2.0,mod(vPos.x,4.0));
  col+=vec3(0.85,0.78,0.5)*(step(fx,0.2)*dash+step(fz,0.2)*dash2);
 }
 float q=length(vPos-cameraPosition)*0.0058;float fog=1.0-exp(-q*q*1.4);
 gl_FragColor=vec4(mix(col,uFog,clamp(fog,0.0,1.0)),1.0);
}`;
