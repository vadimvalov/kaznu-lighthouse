import { chromium } from "playwright";
import "dotenv/config";
import fs from "fs";

export async function scheduleScrapper() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://univer.kaznu.kz/user/login");
  await page.goto("https://univer.kaznu.kz/lang/change/en/");

  await page.waitForSelector('input[type="submit"]');

  const username = process.env.USERNAME;
  const password = process.env.PASSWORD;

  if (!username || !password) {
    throw new Error("env USERNAME or PASSWORD not set");
  }

  await page.fill('input[type="text"].text', username);
  await page.fill('input[type="password"].text', password);

  await page.click('input[type="submit"]');

  const scheduleLink = "https://univer.kaznu.kz/student/myschedule";
  await page.goto(scheduleLink);

  await page.waitForSelector("table.schedule td");

  const data = await page.evaluate(() => {
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const result: Record<string, any[]> = {};
    for (const d of days) result[d] = [];

    const rows = Array.from(document.querySelectorAll("table.schedule tr"));

    rows.forEach((row) => {
      const tds = row.querySelectorAll("td");
      if (tds.length < 2) return;

      const timeRaw = tds.item(0).textContent?.trim() ?? "";
      const time = timeRaw.split("-")[0];

      days.forEach((day, i) => {
        const cell = tds.item(i + 1);
        if (!cell) return;

        const txt = cell.textContent.trim();
        if (!txt) return;

        const lines = txt
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        let course = lines[0];
        const tripleSpaceIndex = course!.search(/ {3,}/);
        if (tripleSpaceIndex !== -1) {
          course = course!.slice(0, tripleSpaceIndex).trim();
        }

        let room = lines.find((l) => l.includes("Hall")) || "";
        room = room
          .replace(/Hall/gi, "")
          .replace(/:/g, "")
          .replace(/\s+/g, " ")
          .trim();

        result[day]!.push({ start_time: time, course, room });
      });
    });

    return result;
  });

  for (const day in data) {
    if (data[day]!.length === 0) delete data[day];
  }

  fs.writeFileSync(
    "public/schedule.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );
  console.log("saved schedule.json");

  await browser.close();
}

// рубильник епта
// top-level-await, позволяет дернуть через npx tsx вручную
if (
  import.meta.url === `file://${process.cwd()}/src/services/scheduleScrapper.ts`
) {
  await scheduleScrapper();
}
