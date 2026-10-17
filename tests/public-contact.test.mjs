import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedContact = "support@joinveylo.com";
const contactPages = ["privacy.html", "terms.html", "support.html", "delete-account.html"];
const read = (file) => fs.readFileSync(path.join(siteRoot, file), "utf8");
const hrefs = (html) => [...html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)]
  .map(([, , href]) => href.replaceAll("&amp;", "&"));

function verifyMailContacts(html) {
  const mailLinks = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(mailto:[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi)];
  assert.ok(mailLinks.length > 0, "Public page must expose a mail contact");
  for (const [, , href] of mailLinks) {
    assert.equal(
      new URL(href.replaceAll("&amp;", "&")).pathname,
      expectedContact,
      "Mail target must use the approved mailbox",
    );
  }
  const visibleText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ");
  const addresses = visibleText.match(/[\w.+-]+@[\w.-]+\.[a-z]+/gi) ?? [];
  assert.ok(addresses.length > 0, "Mail address must be readable without opening a composer");
  for (const address of addresses) {
    assert.equal(address, expectedContact, "Visible contact must use the approved mailbox");
  }
}

for (const file of contactPages) {
  test(`every mail target and readable address in ${file} uses the approved mailbox`, () => {
    verifyMailContacts(read(file));
  });
}

test("rejects a stale mail target even when the visible address is correct", () => {
  assert.throws(
    () => verifyMailContacts('<a href="mailto:support@veylo.app">support@joinveylo.com</a>'),
    /Mail target must use the approved mailbox/,
  );
});

test("rejects stale visible text even when the mail target is correct", () => {
  assert.throws(
    () => verifyMailContacts('<a href="mailto:support@joinveylo.com">Email support</a><p>support@veylo.app</p>'),
    /Visible contact must use the approved mailbox/,
  );
});

test("accepts a valid contact link and readable fallback address", () => {
  assert.doesNotThrow(() => verifyMailContacts(
    '<a href="mailto:support@joinveylo.com?subject=Veylo%20Support">Email support</a><p>support@joinveylo.com</p>',
  ));
});

test("deletion mail action preserves its recipient and prefilled subject", () => {
  assert.ok(hrefs(read("delete-account.html")).includes(
    "mailto:support@joinveylo.com?subject=Veylo%20account%20deletion",
  ), "Deletion action must address support with the existing account-deletion subject");
});

test("support mail action preserves its recipient and prefilled subject", () => {
  assert.ok(hrefs(read("support.html")).includes(
    "mailto:support@joinveylo.com?subject=Veylo%20Support",
  ), "Support action must address support with the existing support subject");
});

for (const file of ["index.html", ...contactPages]) {
  test(`relative file links in ${file} resolve within the static site`, () => {
    const relativeLinks = hrefs(read(file)).filter((href) =>
      !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href));
    assert.ok(relativeLinks.length > 0, "Page must retain its local navigation");
    for (const href of relativeLinks) {
      const filePath = decodeURIComponent(href.split(/[?#]/)[0]);
      const target = path.resolve(siteRoot, path.dirname(file), filePath);
      const relativeTarget = path.relative(siteRoot, target);
      assert.ok(
        relativeTarget !== ".." && !relativeTarget.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeTarget),
        `${file}: ${href} must stay within the static site`,
      );
      assert.ok(fs.statSync(target).isFile(), `${file}: ${href} must resolve to a file`);
    }
  });
}

test("home and support navigation retain the public deletion-request route", () => {
  for (const file of ["index.html", "support.html"]) {
    assert.ok(hrefs(read(file)).includes("./delete-account.html"), `${file} must link to account-deletion support`);
  }
});
