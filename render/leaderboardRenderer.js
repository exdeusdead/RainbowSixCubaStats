const fs=require("fs");
const path=require("path");

const {
 renderHtml
}=require("./engine/browser");


async function renderLeaderboard(players){

let template=fs.readFileSync(
 path.join(__dirname,"templates","leaderboard.html"),
 "utf8"
);


const rows=players.map((p,i)=>`

<div class="player">

<div>
<div class="name">#${i+1} ${p.name}</div>
<div class="rank">${p.rank}</div>
</div>


<div class="stats">
<div>${p.rp}<br>RP</div>
<div>${p.kd}<br>KD</div>
<div>${p.wr}%<br>WR</div>
</div>


</div>

`).join("");


template=template
.replace("{{ROWS}}",rows)
.replace("{{COUNT}}",players.length);


return renderHtml(
 template,
 path.join(__dirname,"output","leaderboard.png")
);

}


module.exports={
 renderLeaderboard
};
