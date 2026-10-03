const KEY="mechanic-city";

function persist(state){
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}
}

function ensureMeta(state){
  state.meta??={};
  state.meta.xp??=0;
  state.meta.level??=1;
  state.meta.rep??=0;
  state.meta.completedJobs??=0;
  state.meta.garageLevel??=1;
  state.meta.dailyStamp??="";
  state.meta.dailyClaimed??=false;
  state.meta.totalEarned??=0;
  state.meta.totalSpent??=0;
  state.meta.unlocked??=[];
  return state.meta;
}

function xpForLevel(level){return 500+(Math.max(0,level-1)*250);}
function syncLevel(state,msg){
  const m=ensureMeta(state);
  while(m.xp>=xpForLevel(m.level)){
    m.xp-=xpForLevel(m.level);
    m.level++;
    m.rep+=5;
    state.money=(state.money||0)+250;
    msg?.("⭐ Новый уровень механика: "+m.level+" · бонус $250");
  }
}

function todayStamp(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function grantDaily(state,msg){
  const m=ensureMeta(state);
  const today=todayStamp();
  if(m.dailyStamp!==today){
    m.dailyStamp=today;
    m.dailyClaimed=false;
  }
  if(m.dailyClaimed)return false;
  m.dailyClaimed=true;
  state.money=(state.money||0)+300+Math.min(700,m.level*50);
  m.xp+=100;
  m.rep+=2;
  m.totalEarned+=300+Math.min(700,m.level*50);
  syncLevel(state,msg);
  persist(state);
  msg?.("🎁 Ежедневный бонус получен");
  return true;
}

function addStyles(){
  if(document.querySelector("#career-system-style"))return;
  const s=document.createElement("style");
  s.id="career-system-style";
  s.textContent=".career-panel{position:absolute;inset:0;z-index:70;background:#0009;display:flex;align-items:flex-end;padding:12px;pointer-events:auto}.career-card{width:min(520px,100%);max-height:86vh;overflow:auto;margin:auto;background:#171b20f7;border:1px solid #ffffff22;border-radius:20px;padding:18px;box-shadow:0 15px 55px #000b;backdrop-filter:blur(16px)}.career-card h2{margin:0 0 6px}.career-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}.career-stat{padding:12px;border-radius:12px;background:#20262b;border:1px solid #ffffff14}.career-stat small{display:block;color:#9da6ad;font-size:10px}.career-stat b{font-size:18px}.career-progress{height:9px;border-radius:9px;background:#0d1012;overflow:hidden}.career-progress i{display:block;height:100%;background:#d9a441}.career-actions{display:grid;gap:8px;margin-top:12px}.career-actions button{padding:12px;border-radius:11px;background:#e8eaec;color:#111;font-weight:800}.career-actions button:disabled{opacity:.45}.career-close{float:right;width:34px;height:34px;border-radius:50%;background:#292f35;color:#fff;font-size:22px}";
  document.head.appendChild(s);
}

export function installCareerSystems({state,msg,renderScene}){
  const meta=ensureMeta(state);
  addStyles();

  const button=document.createElement("button");
  button.id="careerBtn";
  button.type="button";
  button.setAttribute("aria-label","Карьера механика");
  button.textContent="⭐";
  const bar=document.querySelector(".floating-bar");
  bar?.appendChild(button);

  function open(){
    const m=ensureMeta(state);
    const need=xpForLevel(m.level);
    const dailyReady=!m.dailyClaimed;
    const garageCost=1000*m.garageLevel;
    const discount=Math.min(0.25,(m.garageLevel-1)*0.05);
    const html="<div class='career-panel' id='careerPanel'><div class='career-card'><button class='career-close' id='careerClose'>×</button><h2>⭐ Карьера механика</h2><p class='muted'>Развитие профиля, репутация, гараж и награды.</p><div class='career-grid'><div class='career-stat'><small>Уровень</small><b>"+m.level+"</b></div><div class='career-stat'><small>Репутация</small><b>"+m.rep+"</b></div><div class='career-stat'><small>Заданий выполнено</small><b>"+m.completedJobs+"</b></div><div class='career-stat'><small>Всего заработано</small><b>$"+Math.round(m.totalEarned)+"</b></div></div><div class='career-stat'><small>Опыт "+Math.round(m.xp)+" / "+need+"</small><div class='career-progress'><i style='width:"+Math.min(100,m.xp/need*100)+"%'></i></div></div><div class='career-actions'><button id='dailyBtn' "+(dailyReady?"":"disabled")+">🎁 "+(dailyReady?"Забрать ежедневный бонус":"Бонус уже получен")+"</button><button id='garageBtn'>🏭 Улучшить гараж · $"+garageCost+"</button><button id='repairInfo'>🧰 Скидка на ремонт: "+Math.round(discount*100)+"%</button><button id='careerClose2'>Закрыть</button></div></div></div>";
    document.body.insertAdjacentHTML("beforeend",html);
    const panel=document.querySelector("#careerPanel");
    panel.querySelector("#careerClose").onclick=()=>panel.remove();
    panel.querySelector("#careerClose2").onclick=()=>panel.remove();
    panel.addEventListener("pointerdown",e=>{if(e.target===panel)panel.remove();});
    panel.querySelector("#dailyBtn").onclick=()=>{grantDaily(state,msg);panel.remove();open();};
    panel.querySelector("#garageBtn").onclick=()=>{
      if(state.money<garageCost){msg("💸 Недостаточно денег");return;}
      state.money-=garageCost;
      m.totalSpent+=garageCost;
      m.garageLevel++;
      m.xp+=180;
      m.rep+=8;
      syncLevel(state,msg);
      persist(state);
      msg("🏭 Гараж улучшен до уровня "+m.garageLevel);
      panel.remove();open();
    };
    panel.querySelector("#repairInfo").onclick=()=>msg("🧰 Текущая скидка ремонта: "+Math.round(discount*100)+"%");
  }

  button.addEventListener("click",open);

  // Reward completed jobs without touching the existing job logic.
  let wasActive=!!state.job;
  setInterval(()=>{
    if(wasActive && !state.job && state.scene==="city"){
      const m=ensureMeta(state);
      m.completedJobs++;
      m.xp+=250;
      m.rep+=10;
      m.totalEarned+=0;
      syncLevel(state,msg);
      persist(state);
      msg("⭐ Карьера: задание засчитано");
    }
    wasActive=!!state.job;
    if(state.scene==="city" && Math.random()<0.0008) persist(state);
  },1000);

  grantDaily(state,msg);
  window.MechanicCityCareer={
    open,
    addXP(amount=100){const m=ensureMeta(state);m.xp+=Math.max(0,amount);syncLevel(state,msg);persist(state);},
    getState(){return {...ensureMeta(state)}}
  };
}
