import { chromium } from "playwright";
import fetch from "node-fetch"; 
import { writeFile, readFile } from "fs/promises";
import { promises as fs } from "fs";
import { createClient } from '@supabase/supabase-js';


// Initialize Supabase client
const supabaseUrl = 'https://wfpnqezrpahokjdccmfo.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcG5xZXpycGFob2tqZGNjbWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMTcxNTUsImV4cCI6MjA3ODc5MzE1NX0.8DDVFbTMBPNxVTb42-tIqexWHlcyGsofX0p0RWBwk70';
const supabase = createClient(supabaseUrl, supabaseKey);

// Global variables
let FACEBOOK_USER_ID;
let FACEBOOK_FB_DTSG;
let FACEBOOK_JAZOEST;
let FACEBOOK_LSD;
let FACEBOOK_COOKIE;

const url = "https://www.facebook.com/api/graphql/";

/* -------------- Utility Helpers -------------- */

function safeGet(obj, path) {
  return path.split(".").reduce(
    (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
    obj
  );
}

function collectObjectsFromFileContent(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l || !l.startsWith("{") || !l.endsWith("}")) continue;
    try {
      const obj = JSON.parse(l);
      const hasBirthdays =
        !!(obj &&
          obj.data &&
          obj.data.viewer &&
          obj.data.viewer.all_friends_by_birthday_month);
      if (hasBirthdays) return [obj];
    } catch {}
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l || !l.startsWith("{") || !l.endsWith("}")) continue;
    try {
      return [JSON.parse(l)];
    } catch {}
  }
  return [];
}

function extractFromNode(node) {
  const monthName = node?.month_name_in_iso8601 || null;
  const contextText = safeGet(
    node,
    "friends_by_birthday_month_context_sentence.text"
  ) || null;

  const friends = [];
  const upsertFriend = (f) => {
    const key = `${f.profileUrl || ""}|${f.name || ""}`;
    const existingIndex = friends.findIndex(
      (x) => `${x.profileUrl || ""}|${x.name || ""}` === key
    );
    if (existingIndex === -1) {
      friends.push(f);
      return;
    }
    const existing = friends[existingIndex];
    if (!existing.birthday && f.birthday) {
      friends[existingIndex] = { ...existing, birthday: f.birthday };
    }
  };

  const normalizeBirthdate = (raw) => {
    if (!raw) return null;
    if (typeof raw === "object") {
      const source = raw.date && typeof raw.date === "object" ? raw.date : raw;
      const toNum = (v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
        return undefined;
      };
      const day = toNum(source.day ?? source.day_of_month);
      const month = toNum(source.month ?? source.month_number);
      const year = toNum(source.year);
      if (day && month) return { day, month, year: year ?? null };
      return null;
    }
    if (typeof raw === "string") {
      const m = raw.match(
        /(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?)/
      );
      if (m) {
        const month = parseInt(m[1], 10);
        const day = parseInt(m[2], 10);
        const year = m[3] ? parseInt(m[3], 10) : null;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
          return { day, month, year };
      }
    }
    return null;
  };

  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === "object") {
      const typename =
        value.__typename || value.__isActor || value.__isEntity;
      const hasUserHints =
        typename && String(typename).toLowerCase().includes("user");
      const hasProfile = !!value.profile_url || !!value.url;
      if (hasUserHints || hasProfile) {
        const name = value.short_name || value.name || null;
        const profileUrl = value.profile_url || value.url || null;
        const birthday =
          normalizeBirthdate(value.birthdate) ||
          normalizeBirthdate(value.birthday) ||
          normalizeBirthdate(value.birth_date) ||
          normalizeBirthdate(value.birthDate) ||
          normalizeBirthdate(value.date) ||
          null;
        if (name || profileUrl) {
          upsertFriend({
            name,
            profileUrl,
            birthday,
          });
        }
      }
      for (const k of Object.keys(value)) {
        if (
          k === "__typename" ||
          k === "__isActor" ||
          k === "__isEntity"
        )
          continue;
        visit(value[k]);
      }
    }
  };

  visit(node);

  const seen = new Set();
  const deduped = [];
  for (const f of friends) {
    const key = `${f.profileUrl || ""}|${f.name || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      f.birthday &&
      typeof f.birthday === "object" &&
      f.birthday.day &&
      f.birthday.month
    ) {
      deduped.push(f);
    }
  }
  return { monthName, contextText, friends: deduped };
}

/* ---------- Extract session from Chrome CDP ---------- */

async function extractSessionData() {
  console.log("🔍 Extracting session data...");

  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const contexts = browser.contexts();
  const pages = contexts.flatMap((ctx) => ctx.pages());

  if (pages.length === 0) {
    console.error("❌ No pages found");
    await browser.close();
    return null;
  }

  const page = pages[0];
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");

  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      console.log("❌ Timeout: No GraphQL request detected");
      await client.detach();
      await browser.close();
      resolve(null);
    }, 30000);

    let requestProcessed = false;

    client.on("Network.requestWillBeSent", async (params) => {
      if (
        params.request.url.includes("facebook.com/api/graphql") &&
        params.request.method === "POST" &&
        !requestProcessed
      ) {
        requestProcessed = true;
        clearTimeout(timeout);

        console.log("🎯 Found GraphQL request");

        const cookies = await page.context().cookies(params.request.url);
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

        let body = null;
        try {
          const postData = await client.send("Network.getRequestPostData", {
            requestId: params.requestId,
          });
          body = postData.postData;
        } catch (error) {
          console.log("⚠️ Could not get request post data:", error.message);
        }

        const lsd =
          params.request.headers["x-fb-lsd"] ||
          params.request.headers["X-FB-LSD"];
        const fbDtsg = extractValueFromBody(body, "fb_dtsg");
        const jazoest = extractValueFromBody(body, "jazoest");
        const userId = extractValueFromBody(body, "__user");

        FACEBOOK_USER_ID = userId;
        FACEBOOK_FB_DTSG = fbDtsg;
        FACEBOOK_JAZOEST = jazoest;
        FACEBOOK_LSD = lsd;
        FACEBOOK_COOKIE = cookieHeader;

        console.log("✅ Session extracted");

        // Don't close browser immediately, wait for navigation to complete
        setTimeout(async () => {
          await client.detach();
          await browser.close();
          resolve({
            userId,
            fbDtsg,
            jazoest,
            lsd,
            cookie: cookieHeader,
          });
        }, 2000); // Increased delay to ensure page loads
      }
    });

    // Add error handling for page navigation
    page.goto(`https://www.facebook.com/events/birthdays/?acontext={"source":"birthdays"}`, { 
      waitUntil: 'load',
      timeout: 30000 
    }).catch(error => {
      console.log("⚠️ Page navigation warning:", error.message);
      // Don't reject here, let the request interception handle it
    });
  });
}

function extractValueFromBody(body, key) {
  if (!body) return null;
  const match = body.match(new RegExp(`${key}=([^&]*)`));
  return match ? match[1] : null;
}

/* ---------- Insert into Supabase with proper duplicate check ---------- */

async function insertBirthdaysToSupabase(friends) {

  let success = 0;
  let fail = 0;
  let skipped = 0;

  for (const f of friends) {
    try {
      // Skip if no identifying information
      if (!f.name && !f.profileUrl) {
        console.log(`❌ Skipping: No name or profile URL`);
        skipped++;
        continue;
      }
      // Build a more precise query
      let query = supabase
        .from("birthdays")
        .select("id, profile_data");

      // Try multiple query strategies to find duplicates
      let existingRecords = null;

      // Strategy 1: Query by profileUrl if available
      if (f.profileUrl) {
        const { data, error } = await query
          .eq("profile_data->>profileUrl", f.profileUrl);
        
        if (!error && data && data.length > 0) {
          existingRecords = data;
        }
      }

      // Strategy 2: If no results from profileUrl, try by name
      if (!existingRecords && f.name) {
        const { data, error } = await query
          .eq("profile_data->>name", f.name);
        
        if (!error && data && data.length > 0) {
          existingRecords = data;
        }
      }

      // Check if this is a duplicate
      if (existingRecords && existingRecords.length > 0) {
        const isDuplicate = existingRecords.some(record => {
          const existing = record.profile_data;
          // Check if it's the same person
          const isSamePerson = 
            (f.profileUrl && existing.profileUrl === f.profileUrl) ||
            (f.name && existing.name === f.name);

          // Check if birthday is the same
          let isSameBirthday = false;
          if (f.birthday && existing.birthday) {
            isSameBirthday = 
              f.birthday.day === existing.birthday.day &&
              f.birthday.month === existing.birthday.month;
          } else if (!f.birthday && !existing.birthday) {
            isSameBirthday = true;
          }

          return isSamePerson && isSameBirthday;
        });

        if (isDuplicate) {
          console.log(`⏭️ Already saved: ${f.name}`);
          skipped++;
          continue;
        }
      }

      // Insert new record
      // const { error } = await supabase
      //   .from("birthdays")
      //   .insert([
      //     {
      //       profile_data: {
      //         name: f.name,
      //         profileUrl: f.profileUrl,
      //         birthday: f.birthday,
      //         extracted_at: new Date().toISOString(),
      //       },
      //     },
      //   ]);

      if (error) {
        console.log(`❌ Failed to insert ${f.name}:`, error.message);
        fail++;
      } else {
        console.log(`✅ Inserted: ${f.name}`);
        success++;
      }
    } catch (error) {
      // console.log(`❌ Error processing ${f.name}:`, error.message);
      fail++;
    }
  }

  console.log(
    `🎉 Complete → Success: ${success}, Failed: ${fail}, Skipped: ${skipped}`
  );
}

/* ---------- MAIN FETCH FUNCTION ---------- */

async function fetchBirthdays() {
  console.log("🚀 Starting current month's birthday fetch...");

  // Get current month
  const currentMonth = new Date().getMonth() + 1; // 1–12

  console.log("📅 Current month:", currentMonth);

  // Ensure session
  if (
    !FACEBOOK_USER_ID ||
    !FACEBOOK_FB_DTSG ||
    !FACEBOOK_LSD ||
    !FACEBOOK_COOKIE
  ) {
    console.log("🔄 Extracting session...");
    const session = await extractSessionData();
    if (!session) {
      console.error("❌ Cannot extract session");
      return;
    }
  }

  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    "x-fb-lsd": FACEBOOK_LSD,
    cookie: FACEBOOK_COOKIE,
    "x-fb-friendly-name":
      "BirthdayCometMonthlyBirthdaysRefetchQuery",
    Referer: "https://www.facebook.com/events/birthdays/",
  };

  function buildBody(count, cursor = null) {
    const vars = {
      count,
      cursor,
      offset_month: -1,
      scale: 1,
      stream_birthday_months: true,
    };

    const encodedVars = encodeURIComponent(JSON.stringify(vars));
    return (
      `av=${FACEBOOK_USER_ID}&__user=${FACEBOOK_USER_ID}` +
      `&fb_dtsg=${FACEBOOK_FB_DTSG}` +
      `&jazoest=${FACEBOOK_JAZOEST}&lsd=${FACEBOOK_LSD}` +
      `&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=BirthdayCometMonthlyBirthdaysRefetchQuery` +
      `&server_timestamps=true&doc_id=9949483375155057` +
      `&variables=${encodedVars}`
    );
  }

  let monthsToFetch = [];

  if (currentMonth <= 10) {
    // fetch only that month
    monthsToFetch = [currentMonth];
  } else {
    // current month 11 or 12 → fetch both together
    monthsToFetch = [11, 12];
  }

  let friendsForCurrentMonth = [];

  // If single-month case
  if (monthsToFetch.length === 1) {
    const m = monthsToFetch[0];
    const body = buildBody(m);
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();

    await writeFile(`month-${m}.txt`, text);

    const raw = await readFile(`month-${m}.txt`, "utf8");
    const objs = collectObjectsFromFileContent(raw);

    for (const o of objs) {
      const edges = safeGet(
        o,
        "data.viewer.all_friends_by_birthday_month.edges"
      );
      if (!edges) continue;

      for (const e of edges) {
        const node = e?.node;
        if (!node) continue;
        const parsed = extractFromNode(node);
        if (!parsed.monthName) continue;

        const monthNumber = new Date(
          `${parsed.monthName} 1, 2024`
        ).getMonth() + 1;

        if (monthNumber === currentMonth) {
          friendsForCurrentMonth.push(...parsed.friends);
        }
      }
    }

    await fs.unlink(`month-${m}.txt`);
  }

  // If Nov–Dec together
  if (monthsToFetch.length === 2) {
    const body = buildBody(2);
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();

    await writeFile(`months-11-12.txt`, text);

    const raw = await readFile(`months-11-12.txt`, "utf8");
    const objs = collectObjectsFromFileContent(raw);

    for (const o of objs) {
      const edges = safeGet(
        o,
        "data.viewer.all_friends_by_birthday_month.edges"
      );
      if (!edges) continue;

      for (const e of edges) {
        const node = e?.node;
        if (!node) continue;
        const parsed = extractFromNode(node);
        if (!parsed.monthName) continue;

        const monthNumber = new Date(
          `${parsed.monthName} 1, 2024`
        ).getMonth() + 1;

        if (monthNumber === currentMonth) {
          friendsForCurrentMonth.push(...parsed.friends);
        }
      }
    }

    await fs.unlink(`months-11-12.txt`);
  }

  console.log(
    `📌 Birthdays found for current month (${currentMonth}):`,
    friendsForCurrentMonth.length
  );

  if (friendsForCurrentMonth.length > 0) {
    await insertBirthdaysToSupabase(friendsForCurrentMonth);
  } else {
    console.log("⚠️ No birthdays to insert.");
  }

  console.log("🎉 Complete!");
}

fetchBirthdays().catch(console.error);
