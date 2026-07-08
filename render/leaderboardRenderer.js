const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

async function renderLeaderboard(players){

const browser = await puppeteer.launch({
 headless:true,
 args:["--no-sandbox"]
});

const page = await browser.newPage();

await page.setViewport({
 width:1200,
 height:675
});

const rows = players.map((p,i)=>`
<tr>
<td>#${i+1}</td>
<td>${p.name}</td>
<td>${p.rank}</td>
<td>${p.rp}</td>
<td>${p.kd}</td>
<td>${p.wr}%</td>
</tr>
`).join("");

const html=`
<html>
<body>

<div class="panel">

<h4>RAINBOW SIX CUBA</h4>
<h1>COMPETITIVE LEADERBOARD</h1>

<table>

<thead>
<tr>
<th>#</th>
<th>PLAYER</th>
<th>RANK</th>
<th>RP</th>
<th>KD</th>
<th>WR</th>
</tr>
</thead>

<tbody>
${rows}
</tbody>

</table>

<div class="footer">
LIVE STATS ENGINE
</div>

</div>


<style>

body{
margin:0;
background:#05070d;
font-family:Arial;
color:white;
}

.panel{
width:1200px;
height:675px;
padding:50px;
background:
radial-gradient(circle at top right,#e11d4855,transparent 35%),
linear-gradient(135deg,#05070d,#111827);
}

h4{
color:#ff1744;
letter-spacing:4px;
}

h1{
font-size:48px;
}

table{
width:100%;
border-collapse:collapse;
margin-top:40px;
background:#0b1120cc;
border-radius:20px;
overflow:hidden;
}

th{
color:#94a3b8;
text-align:left;
padding:18px;
}

td{
padding:20px;
font-size:24px;
border-top:1px solid #1e293b;
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

const output=path.join(
__dirname,
"output",
"leaderboard.png"
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

const players=Object.values(profiles)
.map(p=>({
name:p.ubisoftName,
rank:p.currentRank || p.parsedStats?.currentRank || "UNRANKED",
rp:p.currentRp || p.parsedStats?.currentRp || 0,
kd:p.seasonKd || p.parsedStats?.seasonKd || 0,
wr:p.seasonWinRate || p.parsedStats?.seasonWinRate || 0
}))
.sort((a,b)=>b.rp-a.rp)
.slice(0,10);

renderLeaderboard(players).then(console.log);

}

module.exports={renderLeaderboard};
