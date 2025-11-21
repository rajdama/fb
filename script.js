import robot from "robotjs";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// ===== ENHANCED FILE MONITORING SYSTEM =====
class EnhancedFileMonitor {
  constructor() {
    this.processedFiles = new Set();
    this.downloadLocations = [
      path.resolve("./fb_data_gif"),
      path.resolve(process.env.downloadfolder || "./downloads"),
      path.resolve(process.env.HOME || process.env.USERPROFILE, "Downloads")
    ];
    this.watchers = [];
  }

  // Check if file is completely written
  isFileComplete(filePath, maxRetries = 10) {
    return new Promise((resolve) => {
      let retries = 0;
      
      const check = () => {
        try {
          const stats = fs.statSync(filePath);
          const initialSize = stats.size;
          
          // Wait and check if file size changes
          setTimeout(() => {
            try {
              const newStats = fs.statSync(filePath);
              if (newStats.size === initialSize && newStats.size > 0) {
                resolve(true); // File is complete
              } else {
                retries++;
                if (retries >= maxRetries) {
                  console.log(`⚠️ File might still be writing: ${filePath}`);
                  resolve(true); // Assume complete after max retries
                } else {
                  check(); // Continue checking
                }
              }
            } catch (error) {
              retries++;
              if (retries >= maxRetries) {
                resolve(false);
              } else {
                check();
              }
            }
          }, 500);
        } catch (error) {
          resolve(false);
        }
      };
      
      check();
    });
  }

  // Find file in all possible locations
  findFile(fileName) {
    for (const location of this.downloadLocations) {
      if (!fs.existsSync(location)) continue;
      
      const filePath = path.join(location, fileName);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
      
      // Also check for files with similar names (Chrome might add (1), (2), etc.)
      const files = fs.readdirSync(location);
      const matchingFile = files.find(f => 
        f.startsWith(fileName.replace('.gif', '')) && f.endsWith('.gif')
      );
      
      if (matchingFile) {
        return path.join(location, matchingFile);
      }
    }
    return null;
  }

  // Wait for file with enhanced reliability
  async waitForFile(fileName, timeoutMs = 5 * 60 * 1000) {
    console.log(`🔍 Searching for: ${fileName}`);
    
    // First, check all locations immediately
    let filePath = this.findFile(fileName);
    if (filePath) {
      console.log(`✅ File found immediately: ${filePath}`);
      if (await this.isFileComplete(filePath)) {
        return filePath;
      }
    }

    // If not found, set up file watchers
    console.log(`⏳ Waiting for file: ${fileName} (timeout: ${timeoutMs/1000}s)`);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let found = false;
      
      const cleanup = () => {
        this.watchers.forEach(watcher => {
          try {
            watcher.close();
          } catch (e) {}
        });
        this.watchers = [];
        clearInterval(interval);
      };
      
      const checkInterval = () => {
        if (found) return;
        
        const currentTime = Date.now();
        if (currentTime - startTime > timeoutMs) {
          cleanup();
          reject(new Error(`Timeout waiting for file: ${fileName}`));
          return;
        }
        
        filePath = this.findFile(fileName);
        if (filePath) {
          this.isFileComplete(filePath).then(complete => {
            if (complete && !found) {
              found = true;
              cleanup();
              console.log(`✅ File detected and verified: ${filePath}`);
              resolve(filePath);
            }
          });
        }
      };
      
      // Set up file system watchers for all locations
      this.downloadLocations.forEach(location => {
        if (!fs.existsSync(location)) {
          try {
            fs.mkdirSync(location, { recursive: true });
          } catch (e) {
            return;
          }
        }
        
        try {
          const watcher = fs.watch(location, (eventType, filename) => {
            if (filename && filename.includes(fileName.replace('.gif', '')) && filename.endsWith('.gif')) {
              console.log(`📁 File system event: ${eventType} - ${filename}`);
              checkInterval();
            }
          });
          this.watchers.push(watcher);
        } catch (error) {
          console.log(`⚠️ Could not watch location: ${location}`);
        }
      });
      
      // Also do periodic checks
      const interval = setInterval(checkInterval, 2000);
      checkInterval(); // Initial check
      
      // Emergency cleanup on promise rejection
      setTimeout(() => {
        if (!found) {
          cleanup();
        }
      }, timeoutMs + 1000);
    });
  }

  cleanup() {
    this.watchers.forEach(watcher => {
      try {
        watcher.close();
      } catch (e) {}
    });
    this.watchers = [];
  }
}

const fileMonitor = new EnhancedFileMonitor();

// ===== EMERGENCY STOP SYSTEM =====
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
  fs.unlinkSync(STOP_FILE);
}

fs.watchFile(STOP_FILE, { interval: 500 }, () => {
  if (fs.existsSync(STOP_FILE)) {
    console.log(
      "\n🚨🚨🚨 EMERGENCY STOP TRIGGERED via file! Terminating program..."
    );
    EMERGENCY_STOP = true;
    try {
      fs.unlinkSync(STOP_FILE);
    } catch (e) {}
    setTimeout(() => {
      console.log("🛑 FORCING EXIT...");
      process.exit(1);
    }, 500);
  }
});

// Terminal listener
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

// Store active pages for cleanup
const activePages = new Map();

// Cleanup function
async function cleanup() {
  console.log("🧹 Cleaning up resources...");
  fileMonitor.cleanup();
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

const supabase = createClient(
  "https://wfpnqezrpahokjdccmfo.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcG5xZXpycGFob2tqZGNjbWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMTcxNTUsImV4cCI6MjA3ODc5MzE1NX0.8DDVFbTMBPNxVTb42-tIqexWHlcyGsofX0p0RWBwk70"
);

// Clean up directories
function cleanupDirectories() {
  const directories = ["./fb_data_gif", "./fb_data"];
  
  directories.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted: ${file}`);
        } catch (err) {
          console.error(`Error deleting ${file}:`, err);
        }
      }
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

cleanupDirectories();

// Python key listener
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

async function runChrome() {
  return new Promise((resolve) => {
    const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;
    const args = [
      "--remote-debugging-port=9222",
      "--user-data-dir=C:\\ChromeAutomationProfile",
    ];

    const child = spawn(chromePath, args, {
      shell: true,
      stdio: "inherit",
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

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log("✅ Saved:", filePath);
    return true;
  } catch (error) {
    console.log("❌ Failed to download:", imageUrl, error.message);
    return false;
  }
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
  
  try {
    await wait(10000);
    await page.mouse.click(1404, 412);
    await page.mouse.wheel(0, -1000);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    const restest = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="image_placeholder"]');
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return { x, y };
    });

    if (!restest) {
      const resyo = await page.evaluate((name) => {
        const el = document.querySelector(`img[alt="unique_1234"]`);
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return { x: centerX, y: centerY };
      }, name);

      if (resyo) {
        await page.mouse.click(resyo.x, resyo.y);
        await page.locator('button[aria-label="Delete"]').click();
        await wait(1000);
        
        await page.evaluate(() => {
          const span = Array.from(document.querySelectorAll("span")).find(
            (el) => el.textContent.trim() === "Delete image"
          );
          if (span) span.click();
        });
      }
    }

    await wait(5000);

    // Uploads section
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Uploads"
      );
      if (span) span.click();
    });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(`./fb_data/${name}.jpg`);
    await wait(10000);

    // Image processing
    await page.locator(`div[aria-label="${name}.jpg"]`).first().click();
    await wait(5000);
    await page.locator('button[aria-label="More"]').click();
    await wait(5000);

    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Alternative text"
      );
      if (span) span.click();
    });

    await wait(5000);
    const str = `unique_1234`;
    await page.keyboard.type(str);

    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Save"
      );
      if (span) span.click();
    });

    try {
      await page.evaluate(() => {
        const span = Array.from(document.querySelectorAll("span")).find(
          (el) => el.textContent.trim() === "Delete image"
        );
        if (span) span.click();
      });
    } catch (e) {
      console.log("Delete image not needed:", e.message);
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

      // Perform drag and drop
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
    }, str);

    if (result) {
      await page.mouse.click(result.x, result.y, { clickCount: 2 });
      await page.keyboard.press("Control+A");
      await page.keyboard.type(name);
      await wait(2000);
    }

    const elementres = page.locator('input[aria-label="Design title"]');
    await elementres.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(id);

    // Download process
    await page.evaluate(async () => {
      const shareButton = Array.from(document.querySelectorAll("span")).find(
        (el) => el.textContent.trim() === "Share"
      );
      if (shareButton) shareButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));

      const downloadButton = document.querySelector(
        'button[aria-label="Download"]'
      );
      if (downloadButton) downloadButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    await wait(2000);

    await page.evaluate(async () => {
      document.querySelector('button[aria-label="File type"]').click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      Array.from(document.querySelectorAll("*"))
        .find((el) => el.textContent.trim() === "Short clip, no sound")
        .click();
    });

    await wait(2000);

    const res = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="Select pages"]');
      if (!input) return null;

      const rect = input.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return { centerX, centerY };
    });

    if (res) {
      await page.mouse.click(res.centerX, res.centerY);
      await wait(2000);
      await page.keyboard.press("Control+A");
      await wait(2000);
      await page.keyboard.type("1");
    }

    await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      Array.from(document.querySelectorAll("span"))
        .find((el) => el.textContent.trim() === "Download")
        .click();
    });

    console.log(`✅ Automation completed for ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ Automation failed for ${name}:`, error.message);
    return false;
  }
}

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
          `⏰ Auto-closing tab for ${birthdayName} after ${tenMinutes / 60000} minutes`
        );
        await page.close();
        activePages.delete(birthdayName);
        console.log(`✅ Successfully closed tab for ${birthdayName}`);
      }
    } catch (error) {
      console.log(`❌ Error closing tab for ${birthdayName}:`, error.message);
    }
  }, tenMinutes);

  activePages.set(birthdayName, { page, timerId, closeTime });
}

async function uploadGifAndUpdateDatabase(filePath, fileName) {
  try {
    const id = fileName.replace(".gif", "");
    console.log(`📤 Uploading GIF for ID: ${id}`);

    // Verify file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error(`File is empty: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("gifs")
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
    return publicUrl;
  } catch (error) {
    console.error(`❌ Error processing GIF ${fileName}:`, error.message);
    return null;
  }
}

async function processBirthdayPost(birthday, page2) {
  try {
    checkEmergencyStop();
    
    const expectedFileName = `${birthday.id}.gif`;
    console.log(`🎯 Processing GIF for: ${birthday.name} (ID: ${birthday.id})`);

    // Wait for GIF file with enhanced reliability
    let gifFilePath;
    try {
      gifFilePath = await fileMonitor.waitForFile(expectedFileName, 5 * 60 * 1000);
    } catch (error) {
      console.log(`❌ Failed to find GIF for ${birthday.name}:`, error.message);
      return false;
    }

    // Upload to Supabase
    const publicUrl = await uploadGifAndUpdateDatabase(gifFilePath, expectedFileName);
    if (!publicUrl) {
      console.log(`❌ Failed to upload GIF for ${birthday.name}`);
      return false;
    }

    await wait(2000);

    // Facebook posting
    console.log(`📝 Posting to Facebook for ${birthday.name}`);
    
    await page2.goto("https://www.facebook.com/", { waitUntil: "load" });
    
    // Find and click "Create a post"
    const createPostResult = await page2.evaluate(() => {
      const element = document.evaluate(
        "//*[text()='Create a post']",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      if (!element) return false;

      const targetElement = element.parentElement?.parentElement?.querySelector(
        'div[role="button"] span'
      );
      if (targetElement && targetElement.textContent.includes("What's on your mind")) {
        targetElement.click();
        return true;
      }
      return false;
    });

    if (!createPostResult) {
      console.log("❌ Could not find 'Create a post' button");
      return false;
    }

    await wait(10000);

    // Add photo/video
    await page2.locator('[aria-label="Photo/video"]').nth(1).click();
    
    // Use robotjs to navigate file dialog
    robot.moveMouse(827, 50);
    await wait(500);
    robot.mouseClick("left", true);
    checkEmergencyStop();

    robot.keyTap("a", ["control"]);
    checkEmergencyStop();

    const downloadsPath = path.resolve("./fb_data_gif");
    await robot.typeString(downloadsPath);
    robot.keyTap("enter");
    checkEmergencyStop();

    robot.moveMouse(250, 160);
    await wait(500);
    robot.mouseClick("left", true);
    checkEmergencyStop();
    robot.keyTap("enter");

    await wait(2000);

    // Type message
    const message = process.env.usermessage.replace("&{name}", birthday.name);
    await robot.typeString(message);
    checkEmergencyStop();

    await wait(2000);
    robot.keyTap("enter");
    await wait(2000);

    // Post
    await page2.click('div[aria-label="Post"]');
    await wait(5000);

    // Cleanup uploaded file from storage
    const { data, error } = await supabase.storage
      .from("gifs")
      .remove([`${birthday.id}`]);

    // Update database
    const { data: updateData, error: updateError } = await supabase
      .from("birthdays")
      .update({ card_url: "true" })
      .eq("id", birthday.id);

    // Cleanup local files
    try {
      if (fs.existsSync(gifFilePath)) {
        fs.unlinkSync(gifFilePath);
        console.log(`🗑️ Deleted local GIF: ${path.basename(gifFilePath)}`);
      }
    } catch (error) {
      console.log("⚠️ Could not delete local GIF:", error.message);
    }

    console.log(`✅ Successfully posted for ${birthday.name}`);
    return true;

  } catch (error) {
    console.error(`❌ Error in Facebook post for ${birthday.name}:`, error.message);
    return false;
  }
}

async function main() {
  try {
    checkEmergencyStop();

    // Run oneday-fetch.js
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
    console.log("✅ oneday-fetch.js completed!");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1568, height: 768 },
    });
    const page = await context.newPage();

    // Connect to existing Chrome instance
    const browser2 = await chromium.connectOverCDP("http://localhost:9222");
    const defaultContext = browser2.contexts()[0];

    // Fetch birthdays data
    const { data: birthdaysData, error: birthdaysError } = await supabase
      .from("birthdays")
      .select("*");

    if (birthdaysError) {
      throw new Error(`Supabase error: ${birthdaysError.message}`);
    }

    const birthdaysThisDay = birthdaysData
      .map(row => {
        const profile = row.profile_data;
        if (!profile?.birthday) return null;
        
        return {
          name: profile.name,
          day: profile.birthday.day,
          profileurl: profile.profileUrl,
          month: profile.birthday.month,
          id: row.id,
          card_url: row.card_url,
        };
      })
      .filter(birthday => birthday !== null);

    console.log(`📅 Found ${birthdaysThisDay.length} birthdays in database`);

    for (const birthday of birthdaysThisDay) {
      checkEmergencyStop();
      
      // Skip if already processed
      if (birthday.card_url === "true") {
        console.log(`⏭️ Skipping already processed: ${birthday.name}`);
        continue;
      }

      if (isBirthdayToday(birthday.day, birthday.month)) {
        console.log(
          `\n🎂 Processing: ${birthday.name} - ${birthday.day}/${birthday.month}`
        );

        // Get profile image
        await page.goto(birthday.profileurl, { waitUntil: "load" });
        await wait(3000);

        try {
          const url = await page.$eval(
            `svg[aria-label="${birthday.name}"] image`,
            (img) => img.getAttribute("href") || img.getAttribute("xlink:href")
          );

          console.log("📸 Profile Image URL found");
          const downloadSuccess = await downloadImage(url, `./fb_data/${birthday.name}.jpg`);
          if (!downloadSuccess) {
            console.log(`❌ Skipping ${birthday.name} due to image download failure`);
            continue;
          }
        } catch (error) {
          console.log(`❌ Failed to get profile image for ${birthday.name}:`, error.message);
          continue;
        }

        // Create new tab for Canva
        const page2 = await defaultContext.newPage();

        try {
          // Set download behavior
          const client = await page2.context().newCDPSession(page2);
          await client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: path.resolve("./fb_data_gif"),
          });
          console.log(`✅ Download path set for ${birthday.name}`);
        } catch (error) {
          console.log(`⚠️ Could not set download behavior:`, error.message);
        }

        await page2.goto(
          process.env.canva_url,
          { waitUntil: "load" }
        );

        await wait(5000);

        // Run automation sequence
        const automationSuccess = await clickSequence(birthday.name, birthday.id, page2);
        if (!automationSuccess) {
          console.log(`❌ Automation failed for ${birthday.name}, skipping...`);
          await page2.close();
          continue;
        }

        // Process the birthday post
        const postSuccess = await processBirthdayPost(birthday, page2);
        
        if (postSuccess) {
          // Schedule auto-closure
          scheduleTabClosure(page2, birthday.name);
          console.log(`✅ Completed processing for ${birthday.name}`);
        } else {
          console.log(`❌ Failed to process post for ${birthday.name}`);
          await page2.close();
        }

        // Small delay between processing
        await wait(10000);
      }
    }

    console.log("\n🎉 All birthday processing completed!");
    console.log(`📊 Active tabs: ${activePages.size}`);
    
    activePages.forEach((value, key) => {
      console.log(`   - ${key}: will close at ${value.closeTime.toLocaleTimeString()}`);
    });

  } catch (error) {
    console.error("❌ Main function error:", error);
  } finally {
    await cleanup();
  }
}

// Process cleanup handlers
process.on("SIGINT", async () => {
  console.log("\n🛑 Normal shutdown requested...");
  await cleanup();
  process.exit(0);
});

process.on("uncaughtException", async (error) => {
  console.log("❌ Uncaught Exception:", error);
  await cleanup();
  process.exit(1);
});

// Start the application
main();
