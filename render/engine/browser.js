const puppeteer = require("puppeteer");

async function renderHtml(html, output){

  const browser = await puppeteer.launch({
    headless:true,
    args:["--no-sandbox"]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width:1200,
    height:675
  });

  await page.setContent(html);

  await page.screenshot({
    path:output
  });

  await browser.close();

  return output;
}


module.exports={
  renderHtml
};
