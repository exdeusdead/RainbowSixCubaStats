const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function renderProfile(player){

const browser = await puppeteer.launch({
 headless:true,
 args:["--no-sandbox"]
});

const page = await browser.newPage();

await page.setViewport({
 width:1400,
 height:800
});

const html = `
<html>
<body>

<div class="bg">

<div class="header">
 <div>
  <span>RAINBOW SIX CUBA</span>
  <h1>PLAYER PROFILE</h1>
 </div>

 <div class="status">VERIFIED ✓</div>
</div>


<div class="card">

<div class="player">

 <div class="avatar">
 ${player.name[0].toUpperCase()}
 </div>

 <div>
  <h2>${player.name}</h2>
  <p>Competitive Player</p>
 </div>

</div>


<div class="rank">

 <h3>${player.rank}</h3>
 <div>${player.rp} RP</div>

</div>


<div class="stats">

 <section>
  <b>${player.kd}</b>
  <span>K/D</span>
 </section>

 <section>
  <b>${player.wr}%</b>
  <span>WIN RATE</span>
 </section>

 <section>
  <b>${player.level || "-"}</b>
  <span>LEVEL</span>
 </section>

</div>


<div class="footer">
 Powered by Rainbow Six CUBA Stats Engine
</div>


</div>

</div>


<style>

*{
 box-sizing:border-box;
}

body{
 margin:0;
 width:1400px;
 height:800px;
 background:#030712;
 font-family:Arial,Helvetica,sans-serif;
 color:white;
}


.bg{
 height:100%;
 padding:70px;
 background:
 radial-gradient(circle at top right,#0b72ff55,transparent 35%),
 linear-gradient(135deg,#050914,#101827);
}


.header{
 display:flex;
 justify-content:space-between;
 align-items:center;
}


.header span{
 color:#60a5fa;
 letter-spacing:4px;
}


.header h1{
 font-size:52px;
 margin:5px 0 40px;
}


.status{
 background:#0f766e;
 padding:14px 25px;
 border-radius:30px;
}


.card{
 width:850px;
 background:rgba(15,23,42,.85);
 border:1px solid #334155;
 border-radius:35px;
 padding:45px;
 box-shadow:0 30px 80px #000;
}


.player{
 display:flex;
 gap:25px;
 align-items:center;
}


.avatar{
 width:110px;
 height:110px;
 border-radius:30px;
 display:flex;
 align-items:center;
 justify-content:center;
 font-size:60px;
 background:#2563eb;
}


h2{
 font-size:48px;
 margin:0;
}


.player p{
 color:#94a3b8;
}


.rank{
 margin-top:40px;
}


.rank h3{
 font-size:44px;
 color:#34d399;
 margin:0;
}


.stats{
 margin-top:40px;
 display:flex;
 gap:20px;
}


.stats section{
 flex:1;
 background:#020617;
 border-radius:20px;
 padding:25px;
}


.stats b{
 font-size:40px;
 display:block;
}


.stats span{
 color:#94a3b8;
}


.footer{
 margin-top:40px;
 color:#64748b;
}

</style>

</body>
</html>
`;


await page.setContent(html);

const output = path.join(
 __dirname,
 "output",
 `${player.name}.png`
);

await page.screenshot({path:output});

await browser.close();

return output;

}


if(require.main===module){

const profiles=JSON.parse(
 fs.readFileSync(
 path.join(__dirname,"..","data","r6_profiles.json")
 )
);

const profile=Object.values(profiles)[0];

renderProfile({

 name:profile.ubisoftName,

 rank:
 profile.currentRank ||
 profile.parsedStats?.currentRank ||
 "UNRANKED",

 rp:
 profile.currentRp ||
 profile.parsedStats?.currentRp ||
 0,

 kd:
 profile.seasonKd ||
 profile.parsedStats?.seasonKd ||
 0,

 wr:
 profile.seasonWinRate ||
 profile.parsedStats?.seasonWinRate ||
 0,

 level:
 profile.lifetimeLevel ||
 profile.parsedStats?.lifetimeLevel

}).then(console.log);

}

module.exports={renderProfile};
