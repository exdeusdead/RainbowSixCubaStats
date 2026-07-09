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

<tr>
<td>#${i+1}</td>
<td>${p.name}</td>
<td>${p.rank}</td>
<td>${p.rp}</td>
<td>${p.kd}</td>
<td>${p.wr}%</td>
</tr>

`).join("");


template=template.replace(
 "{{ROWS}}",
 rows
);


return renderHtml(
 template,
 path.join(__dirname,"output","leaderboard.png")
);

}


module.exports={
 renderLeaderboard
};
