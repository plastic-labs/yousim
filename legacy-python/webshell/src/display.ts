import { scrollToBottom, mutWriteLines } from "./input";

function writeLines(message: string[]) {
  message.forEach((item, idx) => {
    displayText(item, idx);
  });
}

function displayText(item: string, idx: number) {
  setTimeout(() => {
    if (!mutWriteLines) return;
    const p = document.createElement("p");
    p.innerHTML = item;
    mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
    scrollToBottom();
  }, 40 * idx);
}

async function asyncWriteLines(message: string[]): Promise<void> {
  const promises = message.map((item, idx) => asyncDisplayText(item, idx));
  return Promise.all(promises).then(() => { });
}

function asyncDisplayText(item: string, idx: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!mutWriteLines) {
        resolve();
        return;
      }
      const p = document.createElement("p");
      p.innerHTML = item;
      mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
      resolve();
    }, 40 * idx);
  });
}

export { writeLines, asyncWriteLines };
