import { expect, type Page } from "@playwright/test";
import {
  makeSwitchAttempt,
  reduceSwitch,
  type SwitchAttempt,
} from "../src/lib/switch";
import {
  switchAnswer,
  switchConfig,
  switchExample,
} from "../src/lib/switch-content";
export async function freezeSwitchClock(page: Page) {
  const time = new Date("2026-11-13T01:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}
export async function waitSwitchReady(page: Page) {
  const panel = page.locator(".experiment");
  await expect(panel).toHaveAttribute("data-phase", /gap|cue|ready/);
  if ((await panel.getAttribute("data-phase")) === "gap")
    await page.clock.runFor(500);
  if ((await panel.getAttribute("data-phase")) === "cue")
    await page.clock.runFor(1000);
  await expect(panel).toHaveAttribute("data-phase", "ready");
}
export async function visibleSwitchChoice(page: Page) {
  const rule = await page.locator(".switch-rule").getAttribute("data-rule");
  return Number(
    await page.locator(".switch-signal").getAttribute(`data-${rule}`),
  );
}
export async function startSwitch(page: Page, stage = 1, mode = "stage") {
  await page.goto(`/games/switch/play?stage=${stage}&mode=${mode}`);
  await page.getByRole("button", { name: "지시 예제로 익히기" }).click();
  const choice = await visibleSwitchChoice(page);
  await page.locator(".switch-choices button").nth(choice).click();
  await page.getByRole("button", { name: "예제 완료 · 도전 시작" }).click();
  await waitSwitchReady(page);
}
export async function completeSwitch(page: Page, timeouts = 0) {
  for (let i = 0; i < 20; i++) {
    if (i) await waitSwitchReady(page);
    await page.getByRole("button", { name: "문항 시작", exact: true }).click();
    if (i >= 20 - timeouts) await page.clock.runFor(5000);
    else {
      const choice = await visibleSwitchChoice(page);
      await page.clock.runFor(50);
      await page.locator(".switch-choices button").nth(choice).click();
    }
    await expect(page.locator(".switch-feedback")).toBeVisible();
    await page
      .getByRole("button", {
        name: i === 19 ? "결과 확인" : "다음 문항",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".result-panel")).toBeVisible();
}
export function switchFixture(stage: number): SwitchAttempt {
  let a = makeSwitchAttempt(stage);
  if (switchConfig(stage).requiresTutorial) {
    a = reduceSwitch(a, { type: "tutorial" });
    a = reduceSwitch(a, {
      type: "tutorialAnswer",
      choice: switchAnswer(switchExample(stage)),
    });
  }
  a = reduceSwitch(a, { type: "start", now: 1000 });
  for (let i = 0; i < 20; i++) {
    while (a.phase === "cue" || a.phase === "gap")
      a = reduceSwitch(a, {
        type: "tick",
        questionId: a.questions[i].id,
        now: a.endsAt!,
      });
    a = reduceSwitch(a, {
      type: "show",
      questionId: a.questions[i].id,
      now: 100000 + i * 100000,
    });
    a = reduceSwitch(a, {
      type: "answer",
      questionId: a.questions[i].id,
      choice: switchAnswer(a.questions[i]),
      now: a.startedAt! + 50,
    });
    a = reduceSwitch(a, { type: "next", now: 150000 + i * 100000 });
  }
  return a;
}
