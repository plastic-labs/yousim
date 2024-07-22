import {
  manual,
  auto,
} from './honcho'
import { scrollToBottom, mutWriteLines } from './input';
import { sanitize } from "./utils";

async function localManual(command: string) {
  let acc = "SEARCHER CLAUDE:\n";
  acc += command.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  if (!mutWriteLines) return;
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = sanitize(acc);
  // span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  acc = "\nSIMULATOR CLAUDE:\n";
  if (!mutWriteLines) return;
  p = document.createElement("p");
  span = document.createElement("span");
  p.appendChild(span);
  span.className = "simulator";
  span.innerHTML = sanitize(acc);
  // span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  const reader: ReadableStreamDefaultReader<string> | void = await manual(
    command
  );
  let more = true;
  if (reader) {
    while (more) {
      const { done, value } = await reader.read();
      if (done) {
        more = false;
      }
      if (value) {
        // console.log(value)
        acc += value;
        // if (!mutWriteLines) return
        // let p = document.createElement("p");
        span.innerHTML = sanitize(acc);
        // span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
        // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      }
    }
  }
  console.log(acc);
}

async function localAuto() {
  let preamble = "SEARCHER CLAUDE:\n";
  let acc = "";
  if (!mutWriteLines) return;
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = sanitize(acc);
  // span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");

  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  let reader: ReadableStreamDefaultReader<string> | void = await auto();
  let more = true;
  let count = 0;
  while (more) {
    if (reader) {
      const { done, value } = await reader.read();
      if (done) {
        if (count > 0) {
          more = false;
          continue;
        }
        count += 1;
        console.log(acc);
        reader = await manual(acc);
        preamble = "\nSIMULATOR CLAUDE:\n";
        acc = "";
        p = document.createElement("p");
        span = document.createElement("span");
        p.appendChild(span);
        span.className = "simulator";
        span.innerHTML = sanitize((preamble + acc));
        // span.innerHTML = (preamble + acc)
        //   .replace(/\n/g, "<br>")
        //   .replace(/ /g, "&nbsp;");
        mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      } else if (value) {
        // console.log(value)
        acc += value;
        // if (!mutWriteLines) return
        // let p = document.createElement("p");
        span.innerHTML = sanitize((preamble + acc));
        // span.innerHTML = (preamble + acc)
        //   .replace(/\n/g, "<br>")
        //   .replace(/ /g, "&nbsp;");
        // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
        scrollToBottom();
      }
    } else {
      more = false;
    }
  }

  console.log(acc);
}

export { localManual, localAuto };
