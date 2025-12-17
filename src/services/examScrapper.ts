import { chromium } from "playwright";
import type { Exam } from "../types.js";
import type { ScrapperCredentials } from "./scheduleScrapper.js";

export interface ExamScrapperResult {
  success: boolean;
  exams?: Exam[];
  error?: string;
}

export async function examScrapper(
  credentials: ScrapperCredentials
): Promise<ExamScrapperResult> {
  let browser;

  try {
    browser = await chromium.launch({ headless: false }); // univer не пускает headless
    const page = await browser.newPage();

    // Login flow (similar to scheduleScrapper)
    await page.goto("https://univer.kaznu.kz/user/login");
    await page.goto("https://univer.kaznu.kz/lang/change/en/");

    await page.waitForSelector('input[type="submit"]', { timeout: 10000 });

    await page.fill('input[type="text"].text', credentials.username);
    await page.fill('input[type="password"].text', credentials.password);

    await page.click('input[type="submit"]');

    await page.waitForTimeout(2000);

    const loginError = await page.$('text="Invalid username or password"');
    if (loginError) {
      await browser.close();
      return {
        success: false,
        error: "Invalid username or password",
      };
    }

    // Go to exam schedule
    const examScheduleLink = "https://univer.kaznu.kz/student/myexam/schedule/";
    await page.goto(examScheduleLink);

    // Wait for the table to appear. inside #scheduleList
    await page.waitForSelector("#scheduleList", { timeout: 10000 });

    const exams = await page.evaluate(() => {
      const result: Exam[] = [];
      const rows = Array.from(document.querySelectorAll("#scheduleList > tbody > tr"));
      
      let currentDateTimeStr = "";

      for (const row of rows) {
        const th = row.querySelector("th");
        if (th) {
            // This is a header row
            const text = th.innerText.trim(); 
            // "15.12.2025 10:00" format: DD.MM.YYYY HH:MM
            const match = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
            if (match && match[1] && match[2]) {
                currentDateTimeStr = `${match[1]} ${match[2]}`;
            }
            continue;
        }

        if (row.classList.contains("link")) {
            // Data row
            const tds = row.querySelectorAll("td");
            // Index 0: Subject
            // Index 1: Professor
            // Index 2: Type (Consultation / Exam ...)
            // Index 3: Room (e.g. "Корп: ФИТ | Ауд.: Онлайн" or "Корп: ФИТ | Ауд.: 309")
            
            if (tds.length < 4) continue;

            const subject = (tds[0]?.innerText || "").trim();
            const typeFull = (tds[2]?.innerText || "").trim(); 
            const roomFull = (tds[3]?.innerText || "").trim();

            const isExam = typeFull.toLowerCase().includes("экзамен");

            if (!isExam) continue; 

            // Extract pure type name if needed, or just keep "Экзамен"
            const type = "Экзамен";

            // Parse room
            let room = roomFull;
            const roomMatch = roomFull.split("Ауд.:");
            if (roomMatch.length > 1 && roomMatch[1]) {
                room = roomMatch[1].trim();
            }

            if (!currentDateTimeStr) continue;

            // Split currentDateTimeStr into date and time
            const parts = currentDateTimeStr.split(' ');
            if (parts.length < 2) continue;
            const datePart = parts[0]!;
            const timePart = parts[1]!;

            result.push({
                subject,
                date: datePart,
                time: timePart,
                room,
                type
            });
        }
      }

      return result;
    });

    await browser.close();

    return {
      success: true,
      exams
    };

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
