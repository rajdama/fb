import robot from "robotjs";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { spawn } from "child_process";
import readline from "readline";

const pyProcess = spawn("python", ["global_key_listener.py"]);

function dragTo(el, x, y) {}

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

// Clean up directories
if (fs.existsSync("./fb_data_gif")) {
  const gifFiles = fs.readdirSync("./fb_data_gif");
  for (const file of gifFiles) {
    const filePath = path.join("./fb_data_gif", file);
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${file}`);
    } catch (err) {
      console.error(`Error deleting ${file}:`, err);
    }
  }
}

if (fs.existsSync("./fb_data")) {
  const dataFiles = fs.readdirSync("./fb_data");
  for (const file of dataFiles) {
    const filePath = path.join("./fb_data", file);
    try {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${file}`);
    } catch (err) {
      console.error(`Error deleting ${file}:`, err);
    }
  }
}

// ===== FILE-BASED EMERGENCY STOP SYSTEM =====
let EMERGENCY_STOP = false;
const STOP_FILE = "./EMERGENCY_STOP.txt";

console.log("🔴 Emergency stop enabled:");
console.log("   1. Press Ctrl+C in terminal (if visible)");
console.log(
  '   2. OR Create "EMERGENCY_STOP.txt" file in this folder to terminate immediately'
);
console.log("   (Works even when terminal is minimized!)");

// Watch for emergency stop file
if (fs.existsSync(STOP_FILE)) {
  fs.unlinkSync(STOP_FILE); // Clean up any existing stop file
}

fs.watchFile(STOP_FILE, { interval: 500 }, () => {
  if (fs.existsSync(STOP_FILE)) {
    console.log(
      "\n🚨🚨🚨 EMERGENCY STOP TRIGGERED via file! Terminating program..."
    );
    EMERGENCY_STOP = true;
    // Delete the stop file
    try {
      fs.unlinkSync(STOP_FILE);
    } catch (e) {}

    setTimeout(() => {
      console.log("🛑 FORCING EXIT...");
      process.exit(1);
    }, 500);
  }
});

// Also keep the original terminal listener as backup
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();

process.stdin.on("keypress", (str, key) => {
  if (key.name === "escape" || (key.ctrl && key.name === "c")) {
    console.log("\n🚨🚨🚨 EMERGENCY STOP TRIGGERED! Terminating program...");
    EMERGENCY_STOP = true;

    setTimeout(() => {
      console.log("🛑 FORCING EXIT...");
      process.exit(1);
    }, 500);
  }
});

// Emergency check function
function checkEmergencyStop() {
  if (EMERGENCY_STOP) {
    console.log("🛑 Emergency stop detected, terminating...");
    cleanup();
    process.exit(1);
  }

  // Also check for stop file on each call (redundant safety)
  if (fs.existsSync(STOP_FILE)) {
    console.log(
      "\n🚨🚨🚨 EMERGENCY STOP FILE DETECTED! Terminating program..."
    );
    try {
      fs.unlinkSync(STOP_FILE);
    } catch (e) {}
    cleanup();
    process.exit(1);
  }
}

// Cleanup function
async function cleanup() {
  console.log("🧹 Cleaning up resources...");
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

async function clickSequence(name, id, page) {
  console.log(`🤖 Starting automation for ${name}`);
  await wait(10000);
  await page.mouse.click(1404, 412);
  await page.mouse.wheel(0, -1000); // Scroll up by 1000 pixels
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });

  const restest = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="image_placeholder"]');
    console.log(el);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    console.log(x, y);
    return { x, y };
  });

  if (!restest) {
const resyo = await page.evaluate((name) => {
    const el = document.querySelector(`img[alt="unique_1234"]`);
    if (!el) return null;
    
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    return {
        x: centerX,
        y: centerY,
    };
}, name); // Pass the name variable as an argument

await page.mouse.click(resyo.x, resyo.y);

    await page.locator('button[aria-label="Delete"]').click();
    await wait(1000);
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Delete image"
      );

      if (span) {
        span.click();
        console.log("Clicked on:", span); 
      } else {
        console.log('No span with text "Alternative text" found');
      }
    });
  }
  await wait(5000);

  // Using page.evaluate to get elements matching exact text
  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent.trim() === "Uploads"
    );

    if (span) {
      span.click();
      // console.log('Clicked on:', span);
    } else {
      console.log('No span with text "Uploads" found');
    }
  });

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(`./fb_data/${name}.jpg`);

  await wait(10000);

  // Locate the image with the specific aria-label
  await page.locator(`div[aria-label="${name}.jpg"]`).first().click();

  await wait(5000);

  await page.locator('button[aria-label="More"]').click();
  await wait(5000);

  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent.trim() === "Alternative text"
    );

    if (span) {
      span.click();
      console.log("Clicked on:", span);
    } else {
      console.log('No span with text "Alternative text" found');
    }
  });

  await wait(5000);
  const str = `unique_1234`

  await page.keyboard.type(str);

  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent.trim() === "Save"
    );

    if (span) {
      span.click();
      console.log("Clicked on:", span);
    } else {
      console.log('No span with text "Alternative text" found');
    }
  });

  try {
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Delete image"
      );

      if (span) {
        span.click();
        console.log("Clicked on:", span);
      } else {
        console.log('No span with text "Alternative text" found');
      }
    });
  } catch (e) {
    console.log(e);
  }

  const result = await page.evaluate((theStr) => {
    const el = document.querySelector('[aria-label="image_placeholder"]');
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const el2 = document.querySelector(`[alt="${theStr}"]`);
    if (!el2) return null;

    const rect2 = el2.getBoundingClientRect();
    const startX = rect2.left + rect2.width / 2;
    const startY = rect2.top + rect2.height / 2;

    // Perform drag and drop in browser context
    el2.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: startX,
        clientY: startY,
      })
    );

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
      })
    );

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        clientX: x,
        clientY: y,
      })
    );

    const el3 = document.querySelector('[aria-label="name_placeholder"]');
    if (!el3) return null;

    const rect3 = el3.getBoundingClientRect();
    return {
      x: rect3.left + rect3.width / 2,
      y: rect3.top + rect3.height / 2,
    };
  }, str); // <-- PASS value correctly

  // Now use page methods in Puppeteer context
  if (result) {
    // Double click at the coordinates
    await page.mouse.click(result.x, result.y, { clickCount: 2 });

    // Select all and type
    await page.keyboard.press("Control+A");
    await page.keyboard.type(name);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const elementres = page.locator('input[aria-label="Design title"]');
  await elementres.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(id);

  await page.evaluate(async () => {
    // Find and click the Share button
    const shareButton = Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent.trim() === "Share"
    );
    if (shareButton) shareButton.click();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Click download button
    const downloadButton = document.querySelector(
      'button[aria-label="Download"]'
    );

    if (downloadButton) downloadButton.click();

    await new Promise((resolve) => setTimeout(resolve, 2000));
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await page.evaluate(async () => {
    document.querySelector('button[aria-label="File type"]').click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    Array.from(document.querySelectorAll("*"))
      .find((el) => el.textContent.trim() === "Short clip, no sound")
      .click();
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const res = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Select pages"]');
    if (!input) return null;

    const rect = input.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return { centerX, centerY };
  });

  if (res) {
    // Click on the input using page.mouse
    await page.mouse.click(res.centerX, res.centerY);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Select all and type '1'
    await page.keyboard.press("Control+A");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await page.keyboard.type("1");
  }

  await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    Array.from(document.querySelectorAll("span"))
      .find((el) => el.textContent.trim() === "Download")
      .click();
  });

  console.log(`✅ Automation completed for ${name}`);
  return true;
}

// Function to schedule tab closure
function scheduleTabClosure(page, birthdayName) {
  const tenMinutes = 7 * 60 * 1000;
  const closeTime = new Date(Date.now() + tenMinutes);

  console.log(
    `🕐 Tab for ${birthdayName} will auto-close at: ${closeTime.toLocaleTimeString()}`
  );

  const timerId = setTimeout(async () => {
    try {
      if (page && !page.isClosed()) {
        console.log(
          `⏰ Auto-closing tab for ${birthdayName} after ${
            tenMinutes / 60000
          } minutes`
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
    // fs.unlinkSync(filePath);
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
      const child = spawn("node", ["oneday-fetch.js"], { stdio: "inherit" });

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

    // console.log("\n🎉 Starting birthday wishes posting process!");
    const { data: dat, error: err } = await supabase
      .from("birthdays")
      .select("*");

    let birthdaysThisDay = [];

    for (const row of dat) {
      checkEmergencyStop();
      const profile = row.profile_data;
      const { day, month } = profile.birthday;
      birthdaysThisDay.push({
        name: profile.name,
        day: day,
        profileurl: profile.profileUrl,
        month: month,
        id: row.id,
        card_url: row.card_url,
      });
    }

    if (err) {
      console.error("Supabase error:", error);
      return;
    }
    // await wait(60000)

    console.log("----------------------------------", birthdaysThisDay);

    for (const birthday of birthdaysThisDay) {
      checkEmergencyStop();
      if (birthday.card_url != "true") {
        if (isBirthdayToday(birthday.day, birthday.month)) {
          console.log(
            `\n🎂 Processing: ${birthday.name} - ${birthday.day}/${birthday.month}`
          );

          await page.goto(birthday.profileurl, { waitUntil: "load" });
          await wait(3000);

          try {
            const url = await page.$eval(
              `svg[aria-label="${birthday.name}"] image`,
              (img) =>
                img.getAttribute("href") || img.getAttribute("xlink:href")
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
            await client.send("Page.setDownloadBehavior", {
              behavior: "allow",
              downloadPath: path.resolve("./fb_data_gif"),
            });

            console.log(
              `✅ Download path set to: ${path.resolve("./fb_data_gif")}`
            );
          } catch (error) {
            console.log(
              `❌ Failed to set download behavior for ${birthday.name}:`,
              error.message
            );
          }

          await page2.goto(
            "https://www.canva.com/design/DAG41EaHN1s/55xjYAlx29ULT2H4N0eTww/edit",
            { waitUntil: "load" }
          );

          await wait(5000);

          await clickSequence(birthday.name, birthday.id, page2);

          console.log("\n🎉 All birthdays processed!");
          console.log(`📊 Active tabs: ${activePages.size}`);
          activePages.forEach((value, key) => {
            console.log(
              `   - ${key}: will close at ${value.closeTime.toLocaleTimeString()}`
            );
          });

          console.log(
            "\n⏳ Waiting for GIF files to be generated and uploaded to Supabase..."
          );

          // FIXED: GIF waiting logic
          let gifFound = false;
          const maxWaitTime = 5 * 60 * 1000; // 5 minutes in milliseconds
          const startTime = Date.now();
          const expectedFileName = `${birthday.id}.gif`;

          console.log(
            `⏳ Waiting for GIF file: ${expectedFileName} (max 5 minutes)...`
          );

          // Check both possible locations
          const downloadLocations = [
            path.join("C:/Users/Raj/Downloads", expectedFileName),
            path.join("./fb_data_gif", expectedFileName),
          ];

          let filePath = null;
          for (const location of downloadLocations) {
            if (
              fs.existsSync(location) &&
              !processedFiles.has(expectedFileName)
            ) {
              console.log(`✅ GIF file found at: ${location}`);
              filePath = location;
              break;
            }
          }

          if (filePath) {
            console.log(`✅ GIF file detected: ${expectedFileName}`);
            await uploadGifAndUpdateDatabase(filePath, expectedFileName);
            processedFiles.add(expectedFileName);
            gifFound = true;
          } else {
            // If file not found initially, wait for it
            console.log(`🔍 Monitoring for GIF file: ${expectedFileName}`);

            const waitStartTime = Date.now();
            while (!gifFound && Date.now() - waitStartTime < maxWaitTime) {
              checkEmergencyStop();

              // Check all possible locations
              for (const location of downloadLocations) {
                if (
                  fs.existsSync(location) &&
                  !processedFiles.has(expectedFileName)
                ) {
                  console.log(`✅ GIF file detected at: ${location}`);
                  await uploadGifAndUpdateDatabase(location, expectedFileName);
                  processedFiles.add(expectedFileName);
                  gifFound = true;
                  break;
                }
              }

              if (!gifFound) {
                console.log(`⏳ Still waiting for ${expectedFileName}...`);
                await wait(3000); // Check every 3 seconds
              }
            }
          }

          if (!gifFound) {
            console.log(
              `❌ Timeout: GIF file ${expectedFileName} not found within 5 minutes`
            );
            continue; // Skip to next birthday
          }

          await wait(2000);

          let birthdayCountToday = 0;
          for (const row of dat) {
            if (row.profile_data.name !== birthday.name) continue;

            checkEmergencyStop();
            const profile = row.profile_data;
            console.log("Checking profile:", profile);
            console.log(dat);
            if (!profile?.birthday) continue;

            const { day, month } = profile.birthday;
            console.log(day, month);
            console.log(isBirthdayToday(day, month));

            if (isBirthdayToday(day, month)) {
              console.log(`Posting wishes for ${profile.name} 🎉`);
              birthdayCountToday++;

              const fbpage = page2;

              try {
                await fbpage.goto("https://www.facebook.com/", {
                  waitUntil: "load",
                });
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

                await wait(10000);

                robot.moveMouse(636, 472);
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

                robot.typeString(`D:\\fb-bday\\fb_data_gif`);
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

                robot.typeString(`Happy birthday @${profile.name}`);

                await wait(2000);

                robot.keyTap("enter");

                await wait(2000);

                robot.moveMouseSmooth(625, 628);
                //   robot.mouseClick();

                if (!fs.existsSync("./fb_data_gif")) {
                  console.log("Folder does not exist.");
                  return;
                }

                const files = fs.readdirSync("./fb_data_gif");

                const { data, error } = await supabase.storage
                  .from("gifs")
                  .remove([`${expectedFileName.replace(".gif", "")}`]);

                console.log(data, error);

                const { data: updateData, error: updateError } = await supabase
                  .from("birthdays")
                  .update({ card_url: "true" })
                  .eq("id", expectedFileName.replace(".gif", ""));

                for (const file of files) {
                  const filePath = path.join("./fb_data_gif", file);
                  try {
                    fs.unlinkSync(filePath); // delete file
                    console.log(`Deleted: ${file}`);
                  } catch (err) {
                    console.error(`Error deleting ${file}:`, err);
                  }
                }
              } finally {
                // Cleanup: close page and browser
                // await fbpage.close();
                // await browser2.close();
              }
            }
          }

          // Schedule auto-closure after 10 minutes
          scheduleTabClosure(page2, birthday.name);

          console.log(
            `✅ Completed processing for ${birthday.name}, tab will auto-close in 10 minutes`
          );

          // Small delay between processing different birthdays
          await wait(2000);
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
process.on("uncaughtException", async (error) => {
  console.log("❌ Uncaught Exception:", error);
  await cleanup();
  process.exit(1);
});

main();
