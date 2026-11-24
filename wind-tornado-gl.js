// «Камера на смерче»: настоящая трёхмерная сцена, которую считает видеокарта.
//
// Один фрагментный шейдер (WebGL1, без текстур и моделей — всё процедурное):
//  * небо и объёмные облака — трассировка луча сквозь слой, плотность из шума,
//    освещение солнцем и вспышками молний; под воронкой облако опущено в стеновое
//    и закручено вокруг мезоциклона;
//  * смерч — объёмная воронка из конденсата: радиус растёт кверху, ось изогнута,
//    полосы вращаются быстрее у земли; внизу — пылевое облако и тёмные обломки;
//  * завесы осадков позади и сбоку, ферма, лесополоса, поля с дорогой;
//  * камера — не картинка, а объектив: оператор ведёт кадр за смерчем с отставанием,
//    ходит по дуге, подъезжает зумом, руки подрагивают сильнее при сильном ветре;
//    искажение, виньетка, зерно и капли на линзе — в самом шейдере.
//
// Единица сцены — 100 м. Камера стоит на земле (глаз 1.7 м), смотрит вдоль +z,
// смерч в двух километрах впереди. Сверху не снимаем.

export const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

export const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uT;        // секунды сцены
uniform vec3  uCam;      // положение камеры
uniform vec4  uAng;      // yaw, pitch, roll, tan(полуугла по вертикали)
uniform float uLight;    // 0 ночь … 1 день
uniform float uFlash;    // вспышка молнии 0…1
uniform vec3  uBolt;     // x экрана, зерно, вкл
uniform float uTx;       // положение смерча по x
uniform float uSpin;     // скорость вращения воронки
uniform float uWind;     // 0…1 — сила ветра (качание травы, зерно)
uniform float uQ;        // качество: 0 — быстро, 1 — полно

#define PI 3.14159265
const float TZ = 16.5;   // расстояние до смерча
const float HT = 4.5;    // высота воронки

float h31(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm2(vec3 p){ return vn(p)*.62 + vn(p*2.03)*.38; }
float fbm3(vec3 p){ return vn(p)*.52 + vn(p*2.03+7.1)*.30 + vn(p*4.11+3.3)*.18; }
float fbm5(vec3 p){ return vn(p)*.40 + vn(p*2.03+7.1)*.26 + vn(p*4.11+3.3)*.17 + vn(p*8.3+1.7)*.10 + vn(p*16.9+5.)*.07; }
float fbm4(vec3 p){ return vn(p)*.47 + vn(p*2.03+7.1)*.27 + vn(p*4.11+3.3)*.16 + vn(p*8.3+1.7)*.10; }

vec3 SUN = normalize(vec3(-.58, .36, -.52));
float dayK(){ return smoothstep(.12, 1., uLight); }

// ---------- облака ----------
float baseH(vec2 xz){
  float d = length(xz - vec2(uTx, TZ));
  return 7.6 - 2.9*exp(-d*d/90.);
}
float cloudDen(vec3 p, int detail){
  float yb = baseH(p.xz) + 0.35*vn(vec3(p.xz*.35, 4.));
  float h = p.y - yb;
  if (h < 0.) return 0.;
  vec2 q = p.xz - vec2(uTx, TZ);
  float r = length(q);
  float a = atan(q.y, q.x) - uT*.045*(9./(r+7.)) + r*.03;          // закрутка мезоциклона
  vec3 pp = vec3(r*cos(a), p.y*1.35, r*sin(a))*.15 + vec3(uT*.012, 0., uT*.006);
  float n = detail > 0 ? (uQ > .5 ? fbm5(pp) : fbm4(pp)) : fbm2(pp);
  float prof = smoothstep(0., 1.4, h) * (1. - smoothstep(4.5, 8.5, h));
  float d = (n*1.55 - .50 + .30*prof) * prof;
  // шельф у самого основания — плоский и гладкий, как у настоящей суперъячейки
  d += .35*smoothstep(1.2,0.,h)*smoothstep(0.,.5,h)*(.5+.5*vn(vec3(p.xz*.2,2.)));
  return clamp(d, 0., 1.);
}

vec3 skyCol(vec3 rd){
  float dk = dayK();
  float e = clamp(rd.y, 0., 1.);
  vec3 zen = mix(vec3(.010,.016,.030), vec3(.30,.43,.62), dk);
  vec3 hor = mix(vec3(.030,.030,.034), vec3(.86,.80,.66), dk);
  vec3 c = mix(hor, zen, pow(e, .55));
  float sunDot = max(dot(rd, SUN), 0.);
  c += dk*vec3(1.,.82,.55)*pow(sunDot, 7.)*.22;                       // зарево солнца за спиной видно краем
  c += vec3(.45,.55,.8)*uFlash*.18;
  return c;
}

vec4 clouds(vec3 ro, vec3 rd, float dither, vec3 haze){
  if (rd.y < .02) return vec4(0.);
  float t0 = max(0., (3.4 - ro.y)/rd.y), t1 = (17. - ro.y)/rd.y;
  t1 = min(t1, t0 + 150.);
  int N = uQ > .5 ? 30 : 18;
  float dt = (t1 - t0)/float(N);
  float T = 1.; vec3 C = vec3(0.);
  float dk = dayK();
  vec3 sunC = vec3(1.,.90,.74)*dk*2.1;
  vec3 baseC = mix(vec3(.012,.014,.020), vec3(.20,.245,.27), dk);
  vec3 topC  = mix(vec3(.02,.025,.04),  vec3(.56,.62,.70), dk);
  for (int i = 0; i < 30; i++){
    if (i >= N) break;
    float t = t0 + (float(i) + dither)*dt;
    vec3 p = ro + rd*t;
    float d = cloudDen(p, 1);
    if (d > .012){
      float dl = cloudDen(p + SUN*1.7, 0) + .5*cloudDen(p + SUN*3.4, 0);
      float lit = exp(-dl*3.2);
      float hh = p.y - baseH(p.xz);
      vec3 amb = mix(baseC, topC, smoothstep(0., 4.5, hh));
      vec3 col = amb*(.55 + .45*lit) + sunC*lit*(.30 + .70*smoothstep(0.,3.,hh));
      col += vec3(.70,.80,1.)*uFlash*(1.6 + 3.0*lit)*(.35 + d);
      float fog = 1. - exp(-t*.011);
      col = mix(col, haze, fog*.55);
      float a = 1. - exp(-d*dt*.95);
      C += T*a*col; T *= 1. - a;
      if (T < .015) break;
    }
  }
  return vec4(C, 1. - T);
}

// ---------- смерч ----------
vec2 axisAt(float y){
  float h = clamp(y/HT, 0., 1.);
  float bend = sin(y*.95 - uT*.33)*.55*pow(h,1.1) + sin(y*2.1 + uT*.5)*.16*h;
  float lean = .9*h*h + .25*sin(uT*.07);
  return vec2(uTx + bend + lean, TZ);
}
float funnelR(float h){ return .24 + 1.55*pow(h, 1.35) + .09*sin(h*9. + uT*.6); }

vec4 tornado(vec3 ro, vec3 rd, float tMax, float dither, vec3 haze){
  vec2 c = vec2(uTx + .5, TZ);
  const float R = 5.4;
  vec2 o = ro.xz - c, d = rd.xz;
  float a = dot(d,d), b = dot(o,d), cc = dot(o,o) - R*R;
  float disc = b*b - a*cc;
  if (disc < 0. || a < 1e-6) return vec4(0.);
  float s = sqrt(disc);
  float t0 = max((-b - s)/a, 0.), t1 = min((-b + s)/a, tMax);
  // по высоте: 0…HT+0.6
  if (abs(rd.y) > 1e-5){
    float ta = (0. - ro.y)/rd.y, tb = (HT + .6 - ro.y)/rd.y;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  } else if (ro.y < 0. || ro.y > HT + .6) return vec4(0.);
  if (t1 <= t0) return vec4(0.);
  int N = uQ > .5 ? 34 : 22;
  float dt = (t1 - t0)/float(N);
  float T = 1.; vec3 C = vec3(0.);
  float dk = dayK();
  vec3 sunC = vec3(1.,.91,.78)*dk*2.3;
  vec3 dustC = vec3(.46,.34,.22);
  for (int i = 0; i < 34; i++){
    if (i >= N) break;
    float t = t0 + (float(i) + dither)*dt;
    vec3 p = ro + rd*t;
    float h = clamp(p.y/HT, 0., 1.);
    vec2 q = p.xz - axisAt(p.y);
    float r = length(q);
    float th = atan(q.y, q.x);
    float w = uSpin*(2.2/(.30 + h*.95));
    float tw = th + uT*w*.35 - p.y*.9;                               // спиральные полосы
    vec3 np = vec3(cos(tw)*r*1.15, sin(tw)*r*1.15, p.y*.62);
    float n  = fbm4(np*2.5 + vec3(0.,0.,-uT*.35));
    float Rf = funnelR(h)*(.85 + .55*(n - .5));
    float core = smoothstep(Rf*1.10, Rf*.30, r);
    float n2 = vn(vec3(cos(tw)*r*6., sin(tw)*r*6., p.y*3.4 - uT*.9));
    float dF = core*(.06 + 2.1*n*n*(.55 + .9*n2)) * (1. - .20*smoothstep(.85, 1., h));
    // пылевое облако у земли
    float rd2 = r/(2.3 + 1.6*smoothstep(1.5,0.,p.y));
    float dn = fbm3(vec3(q*.55 + vec2(cos(uT*.3), sin(uT*.3))*.6, p.y*.9 - uT*.15));
    float dust = exp(-p.y/.70)*smoothstep(1., .08, rd2)*(.20 + 1.5*dn*dn);
    float dens = dF + dust*1.0;
    if (dens > .01){
      vec2 nrm = r > 1e-3 ? q/r : vec2(0.,1.);
      float lit = clamp(dot(vec3(nrm.x,0.,nrm.y), SUN)*.55 + .55, 0., 1.);
      lit = pow(lit, 1.35)*(1. - .30*core) + .30*core*(.45 + .55*n);   // светится насквозь
      vec3 fun = mix(vec3(.24,.26,.30), vec3(.93,.89,.82), lit);
      fun = mix(fun, vec3(.20,.245,.27), pow(h, 3.2)*.9);               // верх сливается с облаком
      vec3 dst = mix(dustC*.35, dustC*1.25, lit);
      float kd = dust*1.15/(dens + 1e-4);
      vec3 col = mix(fun, dst, clamp(kd, 0., 1.)) ;
      col *= .62 + .50*smoothstep(0., 1.1, r/(funnelR(h) + .02));        // внутри темнее, край светлее
      col = mix(col, dst*.8, smoothstep(.45,0., h)*.55*(1.-kd));       // низ воронки запылён
      col *= dk*(.55 + .6*lit) + (1. - dk)*.05;
      col += sunC*lit*.22*dk;
      // тёмные обломки
      float deb = smoothstep(.72, .86, vn(np*5. + vec3(0.,0.,-uT*2.)))*smoothstep(.7,0.,h);
      col *= 1. - .62*deb;
      col += vec3(.75,.84,1.)*uFlash*(1.3 + 2.2*lit)*(.4 + core);
      float fog = 1. - exp(-t*.011);
      col = mix(col, haze, fog*.45);
      float al = 1. - exp(-dens*dt*3.3);
      C += T*al*col; T *= 1. - al;
      if (T < .02) break;
    }
  }
  return vec4(C, 1. - T);
}

// ---------- земля и силуэты ----------
vec3 hazeCol(vec3 rd){
  float dk = dayK();
  vec3 h = mix(vec3(.030,.030,.034), vec3(.74,.72,.64), dk);
  h = mix(h, vec3(.95,.82,.60), dk*.35*smoothstep(.2,-.9,rd.x));      // тёплый просвет слева
  return h + vec3(.35,.45,.7)*uFlash*.10;
}

vec3 groundCol(vec3 ro, vec3 rd, float t, vec3 haze){
  vec3 p = ro + rd*t;
  vec2 g = p.xz;
  float dk = dayK();
  float cx = floor(g.x*.30 + .8*vn(vec3(g*.03, 1.)));
  float cz = floor(g.y*.13 + cx*.37);
  float hh = h21(vec2(cx*1.7 + 3.1, cz*2.3 - cx*.9));
  vec3 a = mix(vec3(.17,.25,.09), vec3(.36,.40,.16), h21(vec2(cz*3.7, cx*1.3 + 9.)));
  vec3 b = vec3(.26,.19,.12);
  vec3 w = vec3(.60,.52,.28);
  vec3 col = a;
  if (hh > .38) col = w;
  if (hh > .58) col = b;
  if (hh > .80) col = a*.7;
  float rows = .5 + .5*sin(g.x*(30. + 12.*hh));
  col *= mix(1., .93 + .10*rows, exp(-t*.10));
  col *= .92 + .16*vn(vec3(g*vec2(4., 1.6), 7.)) + .10*vn(vec3(g*vec2(18., 6.), 8.));
  col *= .86 + .28*vn(vec3(g*vec2(.35,.12), 2.)) + .10*vn(vec3(g*.9, 5.));
  // дорога: гравий, уходящий к горизонту
  float rx = -2.3 + .006*g.y;
  float rd0 = abs(g.x - rx);
  float road = smoothstep(.20, .14, rd0);
  col = mix(col, vec3(.50,.45,.37)*(.8 + .3*vn(vec3(g*3.,5.))), road);
  col = mix(col, col*.6, smoothstep(.04,0.,abs(rd0-.07))*road);
  // трава перед объективом
  if (t < .9){
    float blade = vn(vec3(g.x*70., g.y*22., 0.) + vec3(sin(uT*1.4+g.y*3.)*uWind*3., 0., 0.));
    col = mix(col, vec3(.14,.17,.07)*(.45 + blade), smoothstep(.9,.1,t)*.6);
  }
  col *= dk*.95 + .06;
  // тень под тучей и мокрая земля вокруг осадков
  col *= .62 + .38*exp(-pow((g.x - uTx)*.045, 2.));
  col += vec3(.7,.8,1.)*uFlash*.10;
  float fog = 1. - exp(-t*.022);
  return mix(col, haze, fog);
}

// завеса осадков: вертикальная плоскость с вытянутой по высоте плотностью
vec4 precip(vec3 ro, vec3 rd, float zp, float cx, float wx, float strength, vec3 haze){
  if (rd.z < 1e-3) return vec4(0.);
  float t = (zp - ro.z)/rd.z;
  if (t < 0.) return vec4(0.);
  vec3 p = ro + rd*t;
  float yb = baseH(p.xz);
  float inx = smoothstep(wx, wx*.25, abs(p.x - cx));
  float iny = smoothstep(0., .35*yb, p.y)*smoothstep(yb + .5, yb - 1.2, p.y);
  float st = vn(vec3(p.x*.9, p.y*.10 + uT*1.4, zp)) *.55 + vn(vec3(p.x*2.6, p.y*.2 + uT*2.1, zp+3.))*.30 + vn(vec3(p.x*.35, p.y*.05, zp+9.))*.40;
  float a = clamp(inx*iny*(.25 + st*.85)*strength, 0., .88);
  float dk = dayK();
  vec3 col = mix(vec3(.04,.045,.055), vec3(.50,.55,.60), dk)*(.7 + .5*smoothstep(.2,-.6,rd.x));
  col = mix(col, haze, .35);
  col += vec3(.75,.85,1.)*uFlash*.5;
  return vec4(col*a, a);
}

vec4 silhouettes(vec3 ro, vec3 rd, vec3 haze){
  // лесополоса вдали
  vec4 res = vec4(0.);
  if (rd.z > 1e-3){
    float t = (58. - ro.z)/rd.z;
    vec3 p = ro + rd*t;
    float hgt = .30 + .55*vn(vec3(p.x*.55, 0., 1.)) + .20*vn(vec3(p.x*2.7,0.,2.));
    if (p.y > 0. && p.y < hgt){
      float tex = vn(vec3(p.x*9., p.y*9., 4.));
      vec3 col = mix(vec3(.035,.06,.035), vec3(.10,.15,.07), tex)*dayK() + vec3(.01);
      col = mix(col, haze, .62);
      res = vec4(col, 1.);
    }
    // ферма: амбар, силос, ряд деревьев
    float tf = (17. - ro.z)/rd.z;
    vec3 f = ro + rd*tf;
    float bx = f.x + 8.5;                                           // центр амбара x = -8.5
    float body = step(abs(bx), .22)*step(0., f.y)*step(f.y, .13);
    float roof = step(0., f.y - .13)*step(f.y - .13, .09 - abs(bx)*.40)*step(abs(bx), .22);
    float silo = step(abs(bx + .31), .045)*step(0., f.y)*step(f.y, .27);
    float cap  = step(abs(bx + .31), .045)*step(.27, f.y)*step(f.y, .27 + (.045 - abs(bx+.31))*.9);
    float tr = step(.26, bx)*step(bx, .95)*step(0., f.y)*step(f.y, .08 + .12*vn(vec3(f.x*6., 0., 8.)))
             * step(.3, vn(vec3(f.x*30., f.y*30., 6.)));
    float obj = max(max(body, roof), max(max(silo, cap), tr));
    if (obj > .5){
      vec3 barn = body > .5 ? vec3(.40,.12,.09) : roof > .5 ? vec3(.22,.20,.19) : silo + cap > .5 ? vec3(.62,.62,.60) : vec3(.04,.07,.03);
      float lit = clamp(.55 + .6*dot(vec3(0.,0.,-1.), SUN), 0., 1.);
      barn *= (dayK()*(.5 + .8*lit) + .04);
      barn = mix(barn, haze, .22);
      res = vec4(barn, 1.);
    }
  }
  return res;
}

// молния: ломаная в экранных координатах
float bolt(vec2 p){
  if (uBolt.z < .5) return 0.;
  float x0 = uBolt.x, seed = uBolt.y;
  float best = 1e3;
  vec2 prev = vec2(x0, .58);
  for (int i = 1; i <= 9; i++){
    float fi = float(i);
    vec2 nxt = vec2(x0 + (h21(vec2(fi, seed)) - .5)*.20*fi*.55, .58 - fi*.065);
    vec2 pa = p - prev, ba = nxt - prev;
    float hh = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.);
    best = min(best, length(pa - ba*hh));
    prev = nxt;
  }
  return 1./(1. + best*best*4e4) + .08/(1. + best*55.);
}

// капли на линзе: смещение координат внутри капли
vec2 lensDrops(vec2 p, out float rim){
  rim = 0.;
  vec2 off = vec2(0.);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    vec2 c = vec2(h21(vec2(fi, 1.))*1.6 - .8, h21(vec2(fi, 2.))*.9 - .45);
    c.y -= mod(uT*.012*(1. + h21(vec2(fi,3.))) + h21(vec2(fi,4.)), 1.)*.2;
    float rr = .018 + .028*h21(vec2(fi, 5.));
    float life = smoothstep(0., .1, fract(uT*.025 + h21(vec2(fi,6.)))) * (1. - smoothstep(.75, 1., fract(uT*.025 + h21(vec2(fi,6.)))));
    vec2 dv = p - c;
    float dd = length(dv/vec2(1., 1.25));
    if (dd < rr && life > .01){
      off += -dv*.55*life;
      rim += smoothstep(rr*.6, rr, dd)*.25*life;
    }
  }
  return off;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - .5*uRes)/uRes.y;
  float rim;
  p += lensDrops(p, rim);
  float k = 1. + .10*dot(p,p);                                       // бочка
  vec2 pd = p*k;

  float yaw = uAng.x, pitch = uAng.y, roll = uAng.z;
  vec3 f = vec3(sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch));
  vec3 rgt = normalize(cross(vec3(0.,1.,0.), f));
  vec3 up = cross(f, rgt);
  float cr = cos(roll), sr = sin(roll);
  vec3 r2 = rgt*cr + up*sr, u2 = up*cr - rgt*sr;
  vec3 rd = normalize(f + (pd.x*r2 + pd.y*u2)*uAng.w*2.);
  vec3 ro = uCam;

  float dither = h21(frag + fract(uT)*61.);
  vec3 haze = hazeCol(rd);

  // небо
  vec3 col = skyCol(rd);
  vec4 cl = clouds(ro, rd, dither, haze);
  col = col*(1. - cl.a) + cl.rgb;

  // грунт и силуэты
  float tg = rd.y < -1e-4 ? -ro.y/rd.y : 1e6;
  vec4 sil = silhouettes(ro, rd, haze);
  if (sil.a > .5) col = sil.rgb;
  // завесы осадков за смерчем и сбоку
  vec4 pr = precip(ro, rd, 46., uTx + 9., 14., 1.0, haze);
  col = col*(1. - pr.a) + pr.rgb;
  pr = precip(ro, rd, 31., uTx + 8.5, 6.5, .9, haze);
  col = col*(1. - pr.a) + pr.rgb;
  if (tg < 1e5) col = groundCol(ro, rd, tg, haze);

  // смерч
  vec4 tn = tornado(ro, rd, tg, dither, haze);
  col = col*(1. - tn.a) + tn.rgb;

  // ближняя завеса справа поверх всего, но прозрачная
  pr = precip(ro, rd, 14., uTx + 12., 6., .55, haze);
  col = col*(1. - pr.a) + pr.rgb;

  // молния и вспышка
  float bl = bolt(p);
  col += vec3(.80,.88,1.)*bl*uBolt.z*(.5 + uFlash);
  col += vec3(.55,.65,.95)*uFlash*.05;

  // объектив
  col += vec3(.9,.95,1.)*rim*.35;
  float vig = 1. - .62*smoothstep(.34, .98, length(p*vec2(.78,1.)));
  col *= vig;
  col = pow(max(col, 0.), vec3(.92));
  float lum = dot(col, vec3(.3,.59,.11));
  col = mix(vec3(lum), col, 1.08);
  col = 1. - exp(-col*1.55);                                         // тональная кривая
  col = smoothstep(vec3(-.01), vec3(1.02), col);
  float gr = h21(frag*1.7 + uT*37.) - .5;
  col += gr*(.045 + .03*uWind);
  gl_FragColor = vec4(col, 1.);
}
`;

// ---------------------------------------------------------------------------
// «Оператор»: положение и поворот камеры как функция времени.
// Детерминированно: один и тот же t всегда даёт один и тот же кадр.
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sines = (t, a) => a.reduce((s, [f, k, p]) => s + k * Math.sin(t * f + p), 0);

export function tornadoX(t) {
  return 2.3 * Math.sin(t * 0.021) + 1.2 * Math.sin(t * 0.057 + 1.3);
}

export function rig(t, wind01) {
  const w = clamp01(wind01);
  // кадр ведёт человек: идёт по дуге, подступает и отступает, меняет зум
  const cx = 5.2 * Math.sin(t * 0.017 + 0.4) + 1.4 * Math.sin(t * 0.043);
  const cz = -2.2 * Math.sin(t * 0.0115 + 0.8);
  const cy = 0.115 + 0.004 * Math.sin(t * 0.9) * w;                    // стоит на пригорке: полтора десятка метров над полем
  const tx = tornadoX(t - 1.6);                                          // отстаёт от смерча — «ведёт»
  const dx = tx + 0.5 - cx, dz = 16.5 - cz;
  // смерч чуть левее центра — композиция по третям
  const yaw0 = Math.atan2(dx, dz) + 0.065 + 0.03 * Math.sin(t * 0.05);
  const pitch0 = 0.10 + 0.022 * Math.sin(t * 0.023 + 2.0);
  const shake = 0.0016 + 0.0042 * w;
  const sy = sines(t, [[1.9, 1, 0.3], [3.3, 0.6, 1.1], [7.9, 0.28, 2.4], [13.1, 0.12, 0.9]]) * shake;
  const sp = sines(t, [[2.3, 1, 1.7], [4.1, 0.6, 0.2], [9.3, 0.25, 3.1]]) * shake * 1.15;
  const sr = sines(t, [[1.1, 1, 0.5], [3.7, 0.4, 2.2]]) * shake * 0.8 + 0.006 * Math.sin(t * 0.07);
  // зум: 22° … 31° половина угла по вертикали, плавно
  const zoomDeg = 17.5 + 3.5 * Math.sin(t * 0.0285 + 1.0) + 0.8 * Math.sin(t * 0.11);
  return {
    cam: [cx, cy, cz], yaw: yaw0 + sy, pitch: pitch0 + sp, roll: sr,
    tanHalf: Math.tan((zoomDeg * Math.PI) / 180), tx,
    zoomDeg,
  };
}

// Проекция точки смерча на кадр — для рамки автофокуса (без искажения линзы).
export function project(r, aspect, point) {
  const [cx, cy, cz] = r.cam;
  const f = [Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), Math.cos(r.yaw) * Math.cos(r.pitch)];
  let rg = [f[2], 0, -f[0]]; const n = Math.hypot(rg[0], rg[2]) || 1; rg = [rg[0] / n, 0, rg[2] / n];
  const u = [f[1] * rg[2] - f[2] * rg[1], f[2] * rg[0] - f[0] * rg[2], f[0] * rg[1] - f[1] * rg[0]];
  const v = [point[0] - cx, point[1] - cy, point[2] - cz];
  const zf = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (zf <= 0.01) return null;
  const x = (v[0] * rg[0] + v[1] * rg[1] + v[2] * rg[2]) / (zf * r.tanHalf * 2);
  const y = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (zf * r.tanHalf * 2);
  return { x: 0.5 + x / aspect, y: 0.5 - y };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false })
    || canvas.getContext("experimental-webgl");
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const m = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(m); }
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn("tornado shader:", e && e.message);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uRes", "uT", "uCam", "uAng", "uLight", "uFlash", "uBolt", "uTx", "uSpin", "uWind", "uQ"]) U[n] = gl.getUniformLocation(prog, n);
  return {
    draw(s) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uT, s.t);
      gl.uniform3f(U.uCam, s.cam[0], s.cam[1], s.cam[2]);
      gl.uniform4f(U.uAng, s.yaw, s.pitch, s.roll, s.tanHalf);
      gl.uniform1f(U.uLight, s.light);
      gl.uniform1f(U.uFlash, s.flash);
      gl.uniform3f(U.uBolt, s.bolt[0], s.bolt[1], s.bolt[2]);
      gl.uniform1f(U.uTx, s.tx);
      gl.uniform1f(U.uSpin, s.spin);
      gl.uniform1f(U.uWind, s.wind);
      gl.uniform1f(U.uQ, s.q);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      try { gl.deleteProgram(prog); gl.deleteBuffer(buf); const e = gl.getExtension("WEBGL_lose_context"); e && e.loseContext(); } catch { /* уже потеряно */ }
    },
  };
}
