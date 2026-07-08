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
    width:1200,
    height:675
  });

  const html = `
  <html>
  <body style="
    background:#05080f;
    color:white;
    font-family:Arial;
    width:1200px;
    height:675px;
    display:flex;
    align-items:center;
    justify-content:center;
  ">

  <div style="
    width:850px;
    padding:50px;
    border:1px solid #26344d;
    border-radius:30px;
    background:#101722;
  ">

  <h1>${player.name}</h1>

  <h2>${player.rank}</h2>

  <h3>${player.rp} RP</h3>

  <p>KD ${player.kd} | WR ${player.wr}%</p>

  </div>

  </body>
  </html>
  `;

  await page.setContent(html);

  const output = path.join(
    __dirname,
    "output",
    `${player.name}.png`
  );

  await page.screenshot({
    path:output
  });

  await browser.close();

  return output;
}


if(require.main === module){

 const profiles = JSON.parse(
   fs.readFileSync(
     path.join(__dirname,"..","data","r6_profiles.json"),
     "utf8"
   )
 );

 const profile = Object.values(profiles)[0];

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
     0

 }).then(console.log);

}

module.exports={
 renderProfile
};
