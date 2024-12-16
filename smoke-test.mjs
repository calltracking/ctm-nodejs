
/*
USAGE

- Log into CTM in dev and prod
- Make sure PHONE_TEST_DEV_TOKEN and PHONE_TEST_DEV_EMAIL are set with the current sessions' ctm_auth_cap tokens
- Run this to start test:
  node smoke-test.mjs <number-to-receive-calls> <number-to-send-calls-from>

*/

import puppeteer from "puppeteer";
import process from 'process';

const hasInspectBrkFlag = process.execArgv.some(arg => arg.includes('--inspect-brk'));
if (!hasInspectBrkFlag) {
  console.log("if you wanna debug this code and want 'debugger' to work, do:")
  console.log("node --inspect-brk smoke-test.mjs");
  console.log("then open chrome://inspect/#devices in your browser and click 'inspect'");
}

// Global vars

const token = process.env.PHONE_TEST_DEV_TOKEN;
const email = process.env.PHONE_TEST_DEV_EMAIL;

const args = process.argv.slice(2);
const devNumber = args[0];
const prodNumber = args[1];

if (!devNumber || !prodNumber) {
  console.error("Usage: smoke-test.mjs <number-to-receive-calls> <number-to-send-calls-from>");
  process.exit(1);
}

// Launch phone

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
      width: 1200,
      height: 700,
    },
  }
);

process.on('uncaughtException', async (err) => {
  console.error('\n\x1b[31mUncaught Exception:\x1b[0m', err);
  // if (process.env.DEBUG_PHONE_TEST) {
    console.log('Keeping browser open for debugging...');
    await new Promise(() => {}); // Prevent script from exiting
  // }
});

const page = await browser.newPage();
console.log(`loading page: http://app.ctmdev.us/phone_test?token=${token}&email=${email}`);
await page.goto(`http://app.ctmdev.us/phone_test?token=${token}&email=${email}`);

// wait for the device to be registered, this can take a while, also make sure you accept the camera/mic permissions on chrome tab
// await deviceFrame.waitForSelector(".register-details", { visible: true, timeout: 45000 });

const frameElement = await page.$('iframe[src*="https://app.ctmdev.us/phoneapp/embed"]');
const frame = await frameElement.contentFrame();

if (!frame) {
  console.error("embedded phone iframe not found.... strange.... figure it out! :P");
  process.exit(1);
}

await frame.waitForSelector('ctm-phone-input', { visible: true, timeout: 10000 });

await frame.evaluate(() => {
  document.querySelector('ctm-phone-control').agent.setStatus('online');
});

// Store settings in a var for later
const phoneSettings = await frame.evaluate(() => {
  return document.querySelector('ctm-phone-control').settings;
});

///// Helper functions ////

const makeCallFromProd = async () => {
  console.log(`about to make call from prod number ${prodNumber} to dev number ${devNumber}`);
  try {
    const url = `https://app.calltrackingmetrics.com/api/v1/accounts/${process.env.PHONE_TEST_PROD_ACCOUNT_ID}/calls/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // 'Authorization': 'Basic {{Basic Auth}}',
        'Content-Type': 'application/json',
        'Cookie': `ctm_auth_cap=${process.env.PHONE_TEST_PROD_TOKEN}`,
      },
      body: JSON.stringify({
        from_number: `+1${prodNumber}`,
        call_number: `+1${devNumber}`,
      }),
    });

    if (!response.ok) {
      console.log(`Request failed with status ${response.status}`);
      throw new Error(`Request failed with status ${response.status}`);
    }

    const res = await response.json();
    console.log(res);
  } catch (error) {
    console.log(error);
  };
}

const getWrapUpPanelSelector = (key) => {
  switch (key) {
    case 'caller_profile':
      return 'ctm-contact-panel';
    case 'caller_sale':
      return 'ctm-score-panel';
    default:
      return 'ctm-custom-panel';
  }
};

const sleep = (ms) => {
  console.log('sleeping for', ms);
  return new Promise(resolve => setTimeout(resolve, ms));
}

const makeInboundCall = async () => {
  await makeCallFromProd();

  // Answer the call!
  await frame.locator('.accept-call-button', { timeout: 8000 }).click();

  // Wait until we are showing "inbound" status which means the call has connected
  await frame.locator('.agent-status-inbound').click();

  const status = await frame.locator('main').map((main) => main.dataset.status).wait();
  // console.log('status', status);

  const callDetails = await frame.locator('ctm-phone-control').map((control) => control.callDetails).wait();
  // console.log('callDetails', callDetails);

  console.log('waiting 8 secs before hanging up...');
  await sleep(6000);
  frame.click("a.hangup-call-button");
}

const logSuccess = (msg = null) => {
  if (!msg) {
    // Capture the stack trace
    const stack = {};
    Error.captureStackTrace(stack);

    // The stack trace is stored as a string in stack.stack
    const stackLines = stack.stack.split('\n');
    const callerLine = stackLines[2]; // The third line is typically where the caller function is

    // Extract the function name using a regular expression
    const functionNameMatch = callerLine.match(/at (\S+)/);
    const functionName = functionNameMatch ? functionNameMatch[1] : 'UnknownFunction';

    msg = `${functionName} passed`;
  }

  console.log('\n\x1b[32m%s\x1b[0m', `${msg}`);
};

///// Tests /////

const testOutboundCall = async () => {
  await frame.evaluate((prodNumber) => {
    const phoneInput = document.querySelector('ctm-phone-input');
    phoneInput.value = prodNumber;
  }, prodNumber);

  const callButton = await frame.waitForSelector('.call-button', { visible: true, timeout: 2000 });
  await callButton.click();
  console.log(`Making outbound call to ${prodNumber}...`);

  // await frame.locator('a.hangup-call-button', { hidden: true, timeout: 1000 }).click(); This will test the fast hangup issue! Uncomment when we fix that.

  await sleep(6000);
  frame.click("a.hangup-call-button");

  const wrapUpSelector = getWrapUpPanelSelector(phoneSettings.wrap_up_panel)
  console.log('waiting for wrap up panel:', wrapUpSelector);
  await frame.waitForSelector(wrapUpSelector, { visible: true, timeout: 2000 });

  // Set status to Ready in case it isn't already
  // await frame.evaluate(() => {
  //   document.querySelector('ctm-phone-control').agent.setStatus('online');
  // });
  await frame.waitForSelector('.finish-wrapup', { visible: true, timeout: 2000 });
  await frame.locator('.finish-wrapup').click();

  logSuccess();
}

const testInboundCall = async () => {
  await makeInboundCall();

  const inboundWrapUpSelector = getWrapUpPanelSelector(phoneSettings.inbound_wrap_up_panel);
  console.log('waiting for inbound wrap up panel:', inboundWrapUpSelector);
  await sleep(2000); // Wrapup panel might get "loaded" multiple times. Make sure it's the last time
  await frame.waitForSelector(inboundWrapUpSelector, { visible: true, timeout: 2000 });
  await frame.waitForSelector('.finish-wrapup', { visible: true, timeout: 2000 });

  await frame.locator('.finish-wrapup').click();

  logSuccess();
}

const testParkedPanel = async () => {
  await testParkedPanelAccessible();
  await testParkedPanelCloseable();
}

const testParkedPanelAccessible = async () => {
  await frame.locator('.parked-calls').click();
  await frame.waitForSelector('.parked-options .list-of-calls', { visible: true, timeout: 2000 });

  logSuccess();
}

const testParkedPanelCloseable = async () => {
  await frame.locator('.close-parked-view').click();
  await frame.waitForSelector('.parked-options .list-of-calls', { hidden: true, timeout: 2000 });

  logSuccess();
}

const testKeypadPanel = async () => {
  await testKeypadPanelAccessible();
  await testKeypadNumKeys();
  await testChangeStatusPickerToFromNumerOnFullInput();
  await showCallButtonOnFullInput();
  await testKeypadPanelCloseable();
}

const testKeypadPanelAccessible = async () => {
  await frame.locator('.button-keypad').click();
  await frame.waitForSelector('.keypad', { visible: true, timeout: 2000 });

  logSuccess();
}

const testKeypadNumKeys = async () => {
  // Loop through all 10 numbers and click them all and make sure the number is added to the text input
  for (let i = 0; i < 10; i++) {
    await frame.locator(`#button_${i}`).click();
    const phoneInputValue = await frame.evaluate(() => {
      const inputElement = document.querySelector('.phonenumber-input');
      return inputElement ? inputElement.value.slice(-1) : '';
    });

    if (phoneInputValue !== i.toString()) {
      console.error(`Keypad key ${i} failed!`);
      process.exit(1);
    }
  }
  
  logSuccess();
}

const testChangeStatusPickerToFromNumerOnFullInput = async () => {
  // Clear the input field
  await frame.evaluate(() => {
    const inputElement = document.querySelector('.phonenumber-input');
    if (inputElement) {
      inputElement.value = ''; 
    }
  });
  // Cleaing the input causes us to close the keypad, so reopen it
  await frame.locator('.button-keypad').click();

  await frame.waitForSelector('.agent-status-picker', { visible: true, timeout: 2000 });

  // Fill the input with 10 numbers
  for (let i = 0; i < 10; i++) {
    await frame.locator(`#button_${i}`).click();
  }

  await frame.waitForSelector('.from_number', { visible: true, timeout: 2000 });

  logSuccess();
}

const showCallButtonOnFullInput = async () => {
  // Clear the input field
  await frame.evaluate(() => {
    const inputElement = document.querySelector('.phonenumber-input');
    if (inputElement) {
      inputElement.value = ''; 
    }
  });
  // Cleaing the input causes us to close the keypad, so reopen it
  await frame.locator('.button-keypad').click();

  await frame.waitForSelector('.call-button', { visible: false, timeout: 2000 });

  // Fill the input with 10 numbers
  for (let i = 0; i < 10; i++) {
    await frame.locator(`#button_${i}`).click();
  }

  await frame.waitForSelector('.call-button', { visible: true, timeout: 2000 });

  logSuccess();
}

const testKeypadPanelCloseable = async () => {
  await frame.locator('.toggle-keypad').click();
  await frame.waitForSelector('.keypad', { hidden: true, timeout: 2000 });

  logSuccess();
}

const testQueuePanel = async () => {
  await testQueuePanelAccessible();
  await testQueuePanelCloseable();
}

const testQueuePanelAccessible = async () => {
  await frame.locator('button.queue').click();
  await frame.waitForSelector('.queue-list', { visible: true, timeout: 2000 });

  logSuccess();
}

const testQueuePanelCloseable = async () => {
  await frame.locator('.close-queue-view').click();
  await frame.waitForSelector('.queue-list', { hidden: true, timeout: 2000 });

  logSuccess();
}

const testHistoryTab = async () => {
  await testHistoryTabAccessible();
  await testHistoryTabCloseable();
}

const testHistoryTabAccessible = async () => {
  await frame.locator('#history').click();
  await frame.waitForSelector('activity-history', { visible: true, timeout: 2000 });

  logSuccess();
}

const testHistoryTabCloseable = async () => {
  await frame.locator('.close-history-view').click();
  await frame.waitForSelector('activity-history', { hidden: true, timeout: 2000 });

  logSuccess();
}

const testChatTab = async () => {
  await testChatTabAccessible();
  await testChatTabCloseable();
}

const testChatTabAccessible = async () => {
  await frame.locator('#chat').click();
  await frame.waitForSelector('chat-history', { visible: true, timeout: 2000 });

  logSuccess();
}

const testChatTabCloseable = async () => {
  await frame.locator('.close-chat-view').click();
  await frame.waitForSelector('chat-history', { hidden: true, timeout: 2000 });

  logSuccess();
}

const testTextTab = async () => {
  await testTextTabAccessible();
  await testTextTabCloseable();
}

const testTextTabAccessible = async () => {
  await frame.locator('#text').click();
  await frame.waitForSelector('text-message-list', { visible: true, timeout: 2000 });

  logSuccess();
}

const testTextTabCloseable = async () => {
  await frame.locator('.close-text-view').click();
  await frame.waitForSelector('text-message-list', { hidden: true, timeout: 2000 });

  logSuccess();
}

///// Runner /////

const runTests = async () => {
  await testOutboundCall();
  await testInboundCall();
  await testParkedPanel();
  await testKeypadPanel();
  await testQueuePanel();
  await testHistoryTab();
  await testChatTab();
  await testTextTab();

  logSuccess('All tests passed!');
  process.exit(0);
}

runTests();
