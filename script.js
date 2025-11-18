import robot from "robotjs";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { spawn } from "child_process";
import readline from 'readline';

const pyProcess = spawn("python", ["global_key_listener.py"]);

pyProcess.stdout.on("data", (data) => {
  const lines = data.toString().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === "press") {
        // console.log("Key pressed:", msg.key);
      } else if (msg.type === "exit") {
        console.log("ESC pressed! Exiting...");
        process.exit(0);
      }
    } catch (err) {
      console.error("Error parsing:", line);
    }
  }
});

pyProcess.stderr.on("data", (data) => {
  console.error("Python error:", data.toString());
});

pyProcess.on("close", (code) => {
  console.log(`Python process exited with code ${code}`);
});

// ===== FILE-BASED EMERGENCY STOP SYSTEM =====
let EMERGENCY_STOP = false;
const STOP_FILE = './EMERGENCY_STOP.txt';

console.log('🔴 Emergency stop enabled:');
console.log('   1. Press Ctrl+C in terminal (if visible)');
console.log('   2. OR Create "EMERGENCY_STOP.txt" file in this folder to terminate immediately');
console.log('   (Works even when terminal is minimized!)');

// Watch for emergency stop file
if (fs.existsSync(STOP_FILE)) {
    fs.unlinkSync(STOP_FILE); // Clean up any existing stop file
}

fs.watchFile(STOP_FILE, { interval: 500 }, () => {
    if (fs.existsSync(STOP_FILE)) {
        console.log('\n🚨🚨🚨 EMERGENCY STOP TRIGGERED via file! Terminating program...');
        EMERGENCY_STOP = true;
        // Delete the stop file
        try {
            fs.unlinkSync(STOP_FILE);
        } catch (e) {}
        
        setTimeout(() => {
            console.log('🛑 FORCING EXIT...');
            process.exit(1);
        }, 500);
    }
});

// Also keep the original terminal listener as backup
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();

process.stdin.on('keypress', (str, key) => {
    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        console.log('\n🚨🚨🚨 EMERGENCY STOP TRIGGERED! Terminating program...');
        EMERGENCY_STOP = true;
        
        setTimeout(() => {
            console.log('🛑 FORCING EXIT...');
            process.exit(1);
        }, 500);
    }
});

// Emergency check function
function checkEmergencyStop() {
    if (EMERGENCY_STOP) {
        console.log('🛑 Emergency stop detected, terminating...');
        cleanup();
        process.exit(1);
    }
    
    // Also check for stop file on each call (redundant safety)
    if (fs.existsSync(STOP_FILE)) {
        console.log('\n🚨🚨🚨 EMERGENCY STOP FILE DETECTED! Terminating program...');
        try {
            fs.unlinkSync(STOP_FILE);
        } catch (e) {}
        cleanup();
        process.exit(1);
    }
}

// Cleanup function
async function cleanup() {
    console.log('🧹 Cleaning up resources...');
    process.stdin.setRawMode(false);
    process.stdin.pause();
    try {
        fs.unwatchFile(STOP_FILE);
    } catch (e) {}
    
    // Close all active pages
    if (activePages.size > 0) {
        console.log(`Closing ${activePages.size} active tabs...`);
        for (const [name, { page, timerId }] of activePages) {
            clearTimeout(timerId);
            try {
                if (page && !page.isClosed()) {
                    await page.close();
                }
            } catch (error) {
                console.log(`Error closing tab for ${name}:`, error.message);
            }
        }
        activePages.clear();
    }
}
// ===== END EMERGENCY STOP SYSTEM =====

const supabase = createClient(
  "https://wfpnqezrpahokjdccmfo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcG5xZXpycGFob2tqZGNjbWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMTcxNTUsImV4cCI6MjA3ODc5MzE1NX0.8DDVFbTMBPNxVTb42-tIqexWHlcyGsofX0p0RWBwk70"
);

// Store active pages for cleanup
const activePages = new Map();
// Track processed files to avoid duplicates
const processedFiles = new Set();

async function runChrome() {
  return new Promise((resolve) => {
    const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

    const args = [
      "--remote-debugging-port=9222",
      "--user-data-dir=C:\\ChromeAutomationProfile",
    ];

    const child = spawn(chromePath, args, {
      shell: true, // important for Windows paths
      stdio: "inherit", // show Chrome logs
    });

    child.on("close", (code) => {
      console.log("Chrome exited with code:", code);
      resolve();
    });
  });
}

(async () => {
  console.log("Launching Chrome...");
  await runChrome();
  console.log("Chrome closed. Continue with next steps...");
})();

async function downloadImage(imageUrl, filePath) {
  fs.mkdirSync("./fb_data", { recursive: true });

  const response = await fetch(imageUrl);
  if (!response.ok) {
    console.log("❌ Failed to download:", imageUrl);
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
  console.log("✅ Saved:", filePath);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBirthdayToday(day, month) {
  const today = new Date();
  return (
    today.getDate() === Number(day) && today.getMonth() + 1 === Number(month)
  );
}

async function clickSequence(name, id) {
  console.log(`🤖 Starting automation for ${name}`);
  
  checkEmergencyStop();
  
  robot.moveMouse(1001, 387);
  robot.mouseClick();
  checkEmergencyStop();

  for (let i = 0; i < 30; i++) {
    robot.keyTap("pageup");
    robot.setKeyboardDelay(50);
    if (i % 5 === 0) checkEmergencyStop();
  }

  robot.moveMouse(635, 101);
  robot.mouseClick();
  checkEmergencyStop();
  
  robot.keyTap("a", ["control"]);
  checkEmergencyStop();
  
  robot.typeString(id);
  checkEmergencyStop();
  
  robot.keyTap("enter");
  checkEmergencyStop();

  robot.moveMouse(27, 392);
  robot.mouseClick();
  await wait(500);
  checkEmergencyStop();

  robot.moveMouseSmooth(181, 212);
  robot.mouseClick();
  await wait(500);
  checkEmergencyStop();

  robot.moveMouse(827, 50);
  await wait(500);
  checkEmergencyStop();

  robot.mouseClick("left", true);
  checkEmergencyStop();

  robot.keyTap("a", ["control"]);
  checkEmergencyStop();
  
  robot.typeString(`D:\\fb-bday\\fb_data`);
  checkEmergencyStop();
  
  robot.keyTap("enter");
  checkEmergencyStop();

  robot.moveMouse(226, 134);
  robot.mouseClick();
  await wait(1000);
  checkEmergencyStop();

  robot.moveMouse(1113, 635);
  robot.mouseClick();
  await wait(500);
  checkEmergencyStop();

  robot.moveMouseSmooth(116, 381);
  robot.mouseClick();
  await wait(500);
  checkEmergencyStop();

  robot.moveMouseSmooth(808, 364);
  await wait(500);
  robot.mouseToggle("down", "left");
  await wait(500);
  robot.dragMouse(808, 320);
  await wait(500);
  robot.mouseToggle("up", "left");
  checkEmergencyStop();

  robot.moveMouseSmooth(806, 497);
  robot.mouseClick("left", true);
  checkEmergencyStop();

  robot.keyTap("a", ["control"]);
  checkEmergencyStop();
  
  robot.typeString(`${name}`);
  checkEmergencyStop();

  robot.moveMouseSmooth(1234, 109);
  robot.mouseClick();
  checkEmergencyStop();

  robot.moveMouseSmooth(989, 439);
  robot.mouseClick();
  checkEmergencyStop();

  robot.moveMouseSmooth(1133, 374);
  robot.mouseClick();
  checkEmergencyStop();

  robot.keyTap("a", ["control"]);
  checkEmergencyStop();
  
  robot.typeString("1");
  checkEmergencyStop();

  // Clean up downloaded files
  fs.readdir("./fb_data", (err, files) => {
    if (err) return console.error("Error reading folder:", err);

    files.forEach((file) => {
      const filePath = path.join("./fb_data", file);
      fs.unlink(filePath, (err) => {
        if (err) console.error("Failed to delete:", filePath, err);
        else console.log("Deleted:", filePath);
      });
    });
  });

  robot.moveMouseSmooth(1156, 216);
  robot.mouseClick();
  checkEmergencyStop();

  robot.moveMouseSmooth(1150, 543);
  robot.mouseClick();
  checkEmergencyStop();

  robot.moveMouseSmooth(1108, 470);
  robot.mouseClick();
  checkEmergencyStop();

  console.log(`✅ Automation completed for ${name}`);
  return true;
}

// Function to schedule tab closure
function scheduleTabClosure(page, birthdayName) {
  const tenMinutes = 5 * 60 * 1000;
  const closeTime = new Date(Date.now() + tenMinutes);

  console.log(
    `🕐 Tab for ${birthdayName} will auto-close at: ${closeTime.toLocaleTimeString()}`
  );

  const timerId = setTimeout(async () => {
    try {
      if (page && !page.isClosed()) {
        console.log(
          `⏰ Auto-closing tab for ${birthdayName} after ${tenMinutes / 60000} minutes`
        );
        await page.close();
        activePages.delete(birthdayName);
        console.log(`✅ Successfully closed tab for ${birthdayName}`);
      } else {
        console.log(`ℹ️ Tab for ${birthdayName} was already closed`);
      }
    } catch (error) {
      console.log(`❌ Error closing tab for ${birthdayName}:`, error.message);
    }
  }, tenMinutes);

  // Store the page and timer for potential manual cleanup
  activePages.set(birthdayName, { page, timerId, closeTime });
}

// Function to upload GIF to Supabase and update database
async function uploadGifAndUpdateDatabase(filePath, fileName) {
  try {
    // Extract ID from filename (remove .gif extension)
    const id = fileName.replace(".gif", "");

    console.log(`📤 Uploading GIF for ID: ${id}`);

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("gifs") // Replace with your bucket name
      .upload(`${id}`, fileBuffer, {
        contentType: "image/gif",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    console.log("✅ GIF uploaded to storage");

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("gifs")
      .getPublicUrl(`${fileName}`);

    const publicUrl = `${urlData.publicUrl}`.replace(/\.gif$/, "");
    console.log(`🔗 Public URL: ${publicUrl}`);

    // Update the birthdays table
    const { data: updateData, error: updateError } = await supabase
      .from("birthdays")
      .update({ card_url: publicUrl })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ Database updated for ID: ${id}`);

    // Delete the local file after successful upload
    fs.unlinkSync(filePath);
    console.log(`🗑️ Local file deleted: ${fileName}`);

    return publicUrl;
  } catch (error) {
    console.error(`❌ Error processing GIF ${fileName}:`, error.message);
    return null;
  }
}

// Function to monitor the fb_data_gif folder
function startFileMonitor() {
  console.log("👀 Starting file monitor for ./fb_data_gif folder...");

  const watchPath = "./fb_data_gif";

  // Ensure directory exists
  if (!fs.existsSync(watchPath)) {
    fs.mkdirSync(watchPath, { recursive: true });
  }

  // Initial scan of existing files
  const existingFiles = fs.readdirSync(watchPath);
  existingFiles.forEach((file) => {
    if (file.endsWith(".gif") && !processedFiles.has(file)) {
      console.log(`📁 Found existing GIF: ${file}`);
      const filePath = path.join(watchPath, file);
      uploadGifAndUpdateDatabase(filePath, file);
      processedFiles.add(file);
    }
  });

  // Watch for new files
  fs.watch(watchPath, (eventType, filename) => {
    if (
      filename &&
      filename.endsWith(".gif") &&
      !processedFiles.has(filename)
    ) {
      console.log(`🆕 New GIF detected: ${filename}`);
      const filePath = path.join(watchPath, filename);

      // Wait a bit for file to be completely written
      setTimeout(async () => {
        if (fs.existsSync(filePath)) {
          await uploadGifAndUpdateDatabase(filePath, filename);
          processedFiles.add(filename);
        }
      }, 1000); // 1 second delay to ensure file is fully written
    }
  });

  // Also do periodic scans as backup
  setInterval(() => {
    try {
      const files = fs.readdirSync(watchPath);
      files.forEach((file) => {
        if (file.endsWith(".gif") && !processedFiles.has(file)) {
          console.log(`🔍 Periodic scan found: ${file}`);
          const filePath = path.join(watchPath, file);
          uploadGifAndUpdateDatabase(filePath, file);
          processedFiles.add(file);
        }
      });
    } catch (error) {
      console.error("Error during periodic scan:", error);
    }
  }, 30000); // Scan every 30 seconds as backup
}

async function main() {
  try {
    checkEmergencyStop();

    await new Promise((resolve) => {
      const child = spawn("node", ["fetch-bday.js"], { stdio: "inherit" });
      
      const emergencyCheck = setInterval(() => {
        if (EMERGENCY_STOP) {
          child.kill();
          clearInterval(emergencyCheck);
          resolve();
        }
      }, 100);
      
      child.on("close", () => {
        clearInterval(emergencyCheck);
        resolve();
      });
    });

    checkEmergencyStop();
    console.log("fb.js completed!");
    checkEmergencyStop();

    // Start file monitoring first
    startFileMonitor();
    checkEmergencyStop();

    const { data, error } = await supabase.from("birthdays").select("*");

    if (error) {
      console.error("Supabase error:", error);
      return [];
    }

    const currentMonth = new Date().getMonth() + 1;
    let birthdaysThisMonth = [];

    for (const row of data) {
      checkEmergencyStop();
      const profile = row.profile_data;
      if (!profile?.birthday) continue;

      const { day, month } = profile.birthday;

      if (Number(month) === currentMonth) {
        birthdaysThisMonth.push({
          name: profile.name,
          day: day,
          profileurl: profile.profileUrl,
          month: month,
          id: row.id,
          card_url: row.card_url,
        });
      }
    }

    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1568, height: 768 },
    });

    const page = await context.newPage();

    // // Connect to your existing CDP session
    const browser2 = await chromium.connectOverCDP("http://localhost:9222");
    const defaultContext = browser2.contexts()[0]; // Get the default context

    console.log(
      `Found ${birthdaysThisMonth.length} birthdays in current month:`
    );

    // await wait(60000)

    for (const birthday of birthdaysThisMonth) {
      checkEmergencyStop();
      if (!birthday.card_url) {
        console.log(
          `\n🎂 Processing: ${birthday.name} - ${birthday.day}/${birthday.month}`
        );

        await page.goto(birthday.profileurl, { waitUntil: "load" });
        await wait(3000);

        try {
          const url = await page.$eval(
            `svg[aria-label="${birthday.name}"] image`,
            (img) => img.getAttribute("href") || img.getAttribute("xlink:href")
          );

          console.log("Profile Image URL:", url);
          await downloadImage(url, `./fb_data/${birthday.name}.jpg`);
        } catch (error) {
          console.log(
            `❌ Failed to get profile image for ${birthday.name}:`,
            error.message
          );
          continue;
        }

        // Create new tab in the connected browser (browser2)
        const page2 = await defaultContext.newPage();

        // Set custom download folder for this specific page
        try {
          const client = await page2.context().newCDPSession(page2);
          await client.send("Browser.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: path.resolve("./fb_data_gif"),
          });
        } catch (error) {
          console.log(
            `❌ Failed to set download behavior for ${birthday.name}:`,
            error.message
          );
        }

        await page2.goto(
          "https://www.canva.com/design/DAG43y0rIK0/kOKfgmNIzysN-37BAO3sUw/edit",
          { waitUntil: "load" }
        );

        await wait(5000);

        await clickSequence(birthday.name, birthday.id);

        // Schedule auto-closure after 10 minutes
        scheduleTabClosure(page2, birthday.name);

        console.log(
          `✅ Completed processing for ${birthday.name}, tab will auto-close in 10 minutes`
        );

        // Small delay between processing different birthdays
        await wait(2000);
      }
    }

    // Close the main browser but keep browser2 (connected browser) open
    await browser.close();

    console.log("\n🎉 All birthdays processed!");
    console.log(`📊 Active tabs: ${activePages.size}`);
    activePages.forEach((value, key) => {
      console.log(
        `   - ${key}: will close at ${value.closeTime.toLocaleTimeString()}`
      );
    });

    console.log("\n⏳ Waiting for GIF files to be generated and uploaded to Supabase...");
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const checkInterval = 5000; // Check every 5 seconds
    const startTime = Date.now();

    // Track which birthdays we're waiting for
    const pendingBirthdays = birthdaysThisMonth.filter(b => !b.card_url);
    const uploadedBirthdays = new Set();

    console.log(`📋 Waiting for ${pendingBirthdays.length} birthdays to have GIFs uploaded:`);
    pendingBirthdays.forEach(b => console.log(`   - ${b.name} (ID: ${b.id})`));

    while (Date.now() - startTime < maxWaitTime && uploadedBirthdays.size < pendingBirthdays.length) {
      checkEmergencyStop();
      try {
        // Check Supabase for updated card_url for each pending birthday
        for (const birthday of pendingBirthdays) {
          if (!uploadedBirthdays.has(birthday.id)) {
            const { data, error } = await supabase
              .from("birthdays")
              .select("card_url")
              .eq("id", birthday.id)
              .single();

            if (!error && data && data.card_url) {
              console.log(`✅ GIF uploaded to Supabase for ${birthday.name}: ${data.card_url}`);
              uploadedBirthdays.add(birthday.id);
            }
          }
        }

        const remaining = pendingBirthdays.length - uploadedBirthdays.size;
        if (remaining > 0) {
          console.log(`⏳ Still waiting for ${remaining} GIF upload(s) to complete...`);

          // Also check local files for debugging
          const files = fs.readdirSync("./fb_data_gif");
          const gifFiles = files.filter(file => file.endsWith('.gif'));
          if (gifFiles.length > 0) {
            console.log(`📁 Local GIF files found: ${gifFiles.join(', ')}`);
          }
        }

      } catch (error) {
        console.log("❌ Error checking upload status:", error.message);
      }

      // If all uploaded, break early
      if (uploadedBirthdays.size >= pendingBirthdays.length) {
        break;
      }

      // Wait before checking again
      await wait(checkInterval);
    }

    // Final status
    if (uploadedBirthdays.size === pendingBirthdays.length) {
      console.log(`🎉 All ${uploadedBirthdays.size} GIF files successfully uploaded to Supabase!`);
    } else {
      console.log(`❌ Only ${uploadedBirthdays.size}/${pendingBirthdays.length} GIFs uploaded within 5 minutes, continuing anyway...`);
    }

    // console.log("\n🎉 Starting birthday wishes posting process!");
    const { data: dat, error: err } = await supabase
      .from("birthdays")
      .select("*");

    if (err) {
      console.error("Supabase error:", error);
      return;
    }

      let birthdayCountToday = 0;
for (const row of dat) {
    checkEmergencyStop();
    const profile = row.profile_data;
    console.log("Checking profile:", profile);
    console.log(dat)
    if (!profile?.birthday) continue;

    const { day, month } = profile.birthday;
    console.log(day,month)
    console.log(isBirthdayToday(day, month))

    if (isBirthdayToday(day, month)) {
        console.log(`Posting wishes for ${profile.name} 🎉`);
        birthdayCountToday++;

        const browser3 = await chromium.connectOverCDP(
            "http://localhost:9222"
        );
        const defaultContext3 = browser3.contexts()[0];
        const fbpage = await defaultContext3.newPage(); // Fixed: use defaultContext3 instead of defaultContext
        
        try {
            await fbpage.goto("https://www.facebook.com/", { waitUntil: "load" });
            await fbpage.evaluate(() => {
                const element = document.evaluate(
                    "//*[text()='Create a post']",
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;

                if (!element) return false;

                const targetElement =
                    element.parentElement?.parentElement?.querySelector(
                        'div[role="button"] span'
                    );
                if (
                    targetElement &&
                    targetElement.textContent.includes("What's on your mind")
                ) {
                    targetElement.click();
                    return true;
                }
                return false;
            });

            await wait(2000);

            robot.typeString(`${row.card_url}`);

            robot.keyTap("a", ["control"]);
            robot.keyTap("backspace");

            robot.typeString(`Happy birthday @${profile.name}`);

            await wait(2000);

            robot.keyTap("enter");

            await wait(2000);

            robot.moveMouseSmooth(625, 628);
            robot.mouseClick();

        } finally {
            // Cleanup: close page and browser
            await fbpage.close();
            await browser3.close();
        }
    }
}
  } catch (error) {
    console.error("❌ Main function error:", error);
  } finally {
    await cleanup();
  }
}

// Handle process cleanup
process.on("SIGINT", async () => {
  console.log("\n🛑 Normal shutdown requested...");
  await cleanup();
  process.exit(0);
});

// Handle any uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.log('❌ Uncaught Exception:', error);
  await cleanup();
  process.exit(1);
});

main();