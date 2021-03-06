import { browser, ContextMenus } from "webextension-polyfill-ts";

import { Command } from "./lib/command";
import { Selector } from "./lib/selector";
import { AnalyzerEntry } from "./lib/types";
import { getApiKeys } from "./utility";

const FIRST_INDEX_WITHOUT_TEXT_ANALYZERS = 3;

export function showNotification(message: string): void {
  browser.notifications.create({
    iconUrl: "./icons/48.png",
    message,
    title: "Mitaka",
    type: "basic",
  });
}

export function search(command: Command): void {
  try {
    const url: string = command.search();
    if (url !== "") {
      browser.tabs.create({ url });
    }
  } catch (err) {
    showNotification(err.message);
  }
}

export async function searchAll(command: Command): Promise<void> {
  try {
    await browser.storage.sync.get("searcherStates").then((config) => {
      const states = "searcherStates" in config ? config.searcherStates : {};
      const urls = command.searchAll(states);
      for (const url of urls) {
        browser.tabs.create({ url });
      }
    });
  } catch (err) {
    showNotification(err.message);
  }
}

export async function scan(command: Command): Promise<void> {
  const apiKeys = await getApiKeys();
  try {
    const url: string = await command.scan(apiKeys);
    if (url !== "") {
      browser.tabs.create({ url });
    }
  } catch (err) {
    showNotification(err.message);
  }
}

export function createContextMenuErrorHandler(): void {
  if (browser.runtime.lastError) {
    console.error(browser.runtime.lastError.message);
  }
}

export async function createContextMenus(
  message,
  searcherStates
): Promise<void> {
  await browser.contextMenus.removeAll();

  const text: string = message.selection;
  const selector: Selector = new Selector(text);
  // create searchers context menus based on a type of the input
  const searcherEntries: AnalyzerEntry[] = selector.getSearcherEntries();
  for (const entry of searcherEntries) {
    const name = entry.analyzer.name;
    // continue if a searcher is disabled in options
    if (name in searcherStates && !searcherStates[name]) {
      continue;
    }
    // it tells action/query/type/target to the listner
    const id = `Search ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Search this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }
  // search it on all services
  if (searcherEntries.length >= FIRST_INDEX_WITHOUT_TEXT_ANALYZERS) {
    const query = searcherEntries[FIRST_INDEX_WITHOUT_TEXT_ANALYZERS].query;
    const type = searcherEntries[FIRST_INDEX_WITHOUT_TEXT_ANALYZERS].type;
    const id = `Search ${query} as a ${type} on all`;
    const title = `Search this ${type} on all`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }

  // create scanners context menus based on a type of the input
  const scannerEntries: AnalyzerEntry[] = selector.getScannerEntries();
  for (const entry of scannerEntries) {
    const name = entry.analyzer.name;
    // it tells action/query/type/target to the listner
    const id = `Scan ${entry.query} as a ${entry.type} on ${name}`;
    const title = `Scan this ${entry.type} on ${name}`;
    const contexts: ContextMenus.ContextType[] = ["selection"];
    const options = { contexts, id, title };
    browser.contextMenus.create(options, createContextMenuErrorHandler);
  }
}

if (typeof browser !== "undefined" && browser.runtime !== undefined) {
  browser.runtime.onMessage.addListener((message) => {
    if (message.request === "updateContextMenu") {
      browser.storage.sync.get("searcherStates").then((config) => {
        if ("searcherStates" in config) {
          createContextMenus(message, config.searcherStates);
        } else {
          createContextMenus(message, {});
        }
      });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const id: string = info.menuItemId.toString();
    const command = new Command(id);
    switch (command.action) {
      case "search":
        if (command.target === "all") {
          searchAll(command);
        } else {
          search(command);
        }
        break;
      case "scan":
        scan(command);
        break;
    }
  });
}
