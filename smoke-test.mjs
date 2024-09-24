import puppeteer from "puppeteer";

const args = process.argv.slice(2);

const hasInspectBrkFlag = process.execArgv.some(arg => arg.includes('--inspect-brk'));
if (!hasInspectBrkFlag) {
  console.log("if you wanna debug this code and want 'debugger' to work, do:")
  console.log("node --inspect-brk smoke-test.mjs <email> <password>");
}

if (args.length !== 3) {
  console.error("Usage: smoke-test.mjs <email> <password> <phone_number>");
  process.exit(1);
}


const email = args[0];
const password = args[1];
//lets make sure to take dashes, parenthesis, and spaces out of the phonenumber
const phoneNumber = args[2].replace(/[-()\s]/g, '');

if (!phoneNumber.match(/^\d{10}$/)) {
  console.error("Phone number should be 10 digits");
  process.exit(1);
}

const browser = await puppeteer.launch(
  {
    headless: false,
    timeout: 120000,
    devtools: true,
    args: [
      '--window-size=1400,900',
      '--use-fake-ui-for-media-stream',
      '--disable-features=UserMediaSelectedAudioOutputDevices'
    ],
    defaultViewport: {
      width: 1400,
      height: 900,
    },
  }
);

//login, we need those credentials you passed in
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8001");

await page.waitForSelector("#username");
await page.waitForSelector("#password");
await page.waitForSelector("button[type='submit']");

await page.click("#username");
await page.type("#username", email);

await page.click("#password");
await page.type("#password", password);

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }), // Wait for network to be idle
  page.click("button[type='submit']")
]);

await page.waitForSelector('iframe[src*="https://app.ctmdev.us/phoneapp/embed"]', { timeout: 10000 });
const frameElement = await page.$('iframe[src*="https://app.ctmdev.us/phoneapp/embed"]');
const frame = await frameElement.contentFrame();

if (!frame) {
  console.error("embedded phone iframe not found.... strange.... figure it out! :P");
  process.exit(1);
}

await frame.waitForSelector(".toggle-open-phone", { visible: true });

let newPage;
browser.on('targetcreated', async (target) => {
  const targetPage = await target.page(); if (targetPage && targetPage.url().includes("http://127.0.0.1:8001/device")) {
    newPage = targetPage;
  }
});

await frame.click(".toggle-open-phone");
while (!newPage) {
  await new Promise(resolve => setTimeout(resolve, 100));
}

await newPage.waitForSelector('iframe[src*="https://app.ctmdev.us/phoneapp/embed_device"]', { timeout: 10000 });
await newPage.bringToFront();

const deviceFrameElement = await newPage.$('iframe[src*="https://app.ctmdev.us/phoneapp/embed_device"]');
const deviceFrame = await deviceFrameElement.contentFrame();

const button = await deviceFrame.waitForSelector(".button.register", { visible: true, timeout: 10000 });
await button.click();

//wait for the device to be registered, this can take a while, also make sure you accept the camera/mic permissions on chrome tab
await deviceFrame.waitForSelector(".register-details", { visible: true, timeout: 45000 });

//go back to the main page, phone should now be open
await page.bringToFront();
await frame.waitForSelector("ctm-phone-input", { visible: true, timeout: 10000 });

//here it gets a little tricky, thanks shadow dom
const shadowHost = await frame.waitForSelector('ctm-phone-input');

//first lets try to click the phone input and type in the number
const inputElement = await frame.evaluateHandle(shadowHost => {
  const shadowRoot = shadowHost.shadowRoot;

  return shadowRoot.querySelector('.form-control.phone-number');
}, shadowHost);
const inputElementHandle = await inputElement.asElement();
await inputElementHandle.click();
await inputElementHandle.type(phoneNumber);

//now lets try to get the call button, and click it
const callButton = await frame.waitForSelector('.call-button', { visible: true, timeout: 10000 });
await callButton.click();

const hangupButton = await frame.waitForSelector('a.hangup-call-button', { visible: true, timeout: 10000 });

//45 seconds to do your thing
await frame.waitForSelector('a.hangup-call-button', { hidden: true, timeout: 45000 })
.then(async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
})
.catch(async () => {
  //it has timed out, so lets just hangup and kill the test
  frame.click("a.hangup-call-button");
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
});
