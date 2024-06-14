import command from '../config.json' assert {type: 'json'};
import * as Sentry from "@sentry/browser";
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
// import { ABOUT } from "./commands/about"
import { DEFAULT } from "./commands/default";
// import { PROJECTS } from "./commands/projects";
// import { createWhoami } from "./commands/whoami";
import posthog from 'posthog-js'
import { getUser, newSession, manual, auto } from "./honcho"

posthog.init(import.meta.env.VITE_POSTHOG_KEY,
  {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'always' // or 'always' to create profiles for anonymous users as well
  }
)

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/, "yousim.ai"],
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});

//mutWriteLines gets deleted and reassigned
let mutWriteLines = document.getElementById("write-lines");
let historyIdx = 0
let tempInput = ""
let userInput: string;
// let isSudo = false;
let isPasswordInput = false;
// let passwordCounter = 0;
let bareMode = false;
let NAME = "";

//WRITELINESCOPY is used to during the "clear" command
const WRITELINESCOPY = mutWriteLines;
const TERMINAL = document.getElementById("terminal");
const USERINPUT = document.getElementById("user-input") as HTMLInputElement;
// const INPUT_HIDDEN = document.getElementById("input-hidden");
// const PASSWORD = document.getElementById("password-input");
const PASSWORD_INPUT = document.getElementById("password-field") as HTMLInputElement;
const PRE_HOST = document.getElementById("pre-host");
const PRE_USER = document.getElementById("pre-user");
// const HOST = document.getElementById("host");
// const USER = document.getElementById("user");
const PROMPT = document.getElementById("prompt");
const MAIN_PROMPT = document.querySelector("#input-hidden > span#prompt");
const COMMANDS = ["help", "about", "projects", "whoami", "repo", "banner", "clear"];
const HISTORY: string[] = [];
// const SUDO_PASSWORD = command.password;
// const REPO_LINK = command.repoLink;

const scrollToBottom = () => {
  const MAIN = document.getElementById("main");
  if (!MAIN) return

  MAIN.scrollTop = MAIN.scrollHeight;
}

function userInputHandler(e: KeyboardEvent) {
  const key = e.key;

  switch (key) {
    case "Enter":
      e.preventDefault();
      if (!isPasswordInput) {
        enterKey();
      } else {
        // passwordHandler();
      }

      scrollToBottom();
      break;
    case "Escape":
      USERINPUT.value = "";
      break;
    case "ArrowUp":
      arrowKeys(key);
      e.preventDefault();
      break;
    case "ArrowDown":
      arrowKeys(key);
      break;
    case "Tab":
      tabKey();
      e.preventDefault();
      break;
  }
}

async function enterKey() {
  if (!mutWriteLines || !PROMPT) return
  const resetInput = "";
  let newUserInput;
  userInput = USERINPUT.value;

  posthog.capture('command sent', { command: userInput })

  if (bareMode) {
    newUserInput = userInput;
  } else {
    newUserInput = `<span class='output'>${userInput}</span>`;
  }

  HISTORY.push(userInput);
  historyIdx = HISTORY.length

  //if clear then early return
  if (userInput === 'clear') {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    return
  }

  if (userInput === 'help') {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return
  }

  const div = document.createElement("div");
  div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;

  if (mutWriteLines.parentNode) {
    mutWriteLines.parentNode.insertBefore(div, mutWriteLines);
  }

  USERINPUT.value = resetInput;

  USERINPUT.disabled = true;
  if (MAIN_PROMPT) {
    MAIN_PROMPT.innerHTML = "LOADING..."
  }
  if (NAME === '') {
    if (userInput) {
      NAME = userInput
      await localManual(`/locate ${userInput}`)
      if (MAIN_PROMPT) {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `
      }
    }
  } else if (userInput === '') {
    await localAuto();
  } else {
    await localManual(userInput)
  }
  if (MAIN_PROMPT) {
    if (NAME === '') {
      MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
    } else {
      MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `
    }
  }
  USERINPUT.disabled = false;
  USERINPUT.focus();

  userInput = resetInput;

}

async function localManual(command: string) {
  let acc = "SEARCHER CLAUDE:\n"
  acc += command.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  if (!mutWriteLines) return
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  acc = "\nSIMULATOR CLAUDE:\n"
  if (!mutWriteLines) return
  p = document.createElement("p");
  span = document.createElement("span");
  p.appendChild(span);
  span.className = "simulator";
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  const reader = await manual(command);
  let more = true;
  while (more) {
    const { done, value } = await reader.read();
    if (done) {
      more = false;
    }
    if (value) {
      // console.log(value)
      acc += value
      // if (!mutWriteLines) return
      // let p = document.createElement("p");
      span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
      // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
    }
  }
  console.log(acc)
}

async function localAuto() {
  let preamble = "SEARCHER CLAUDE:\n"
  let acc = ""
  if (!mutWriteLines) return
  let p = document.createElement("p");
  let span = document.createElement("span");
  span.className = "searcher";
  p.appendChild(span);
  span.innerHTML = acc.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");

  mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
  scrollToBottom();

  let reader = await auto();
  let more = true;
  let count = 0
  while (more) {
    const { done, value } = await reader.read();
    if (done) {
      if (count > 0) {
        more = false;
        continue
      }
      count += 1
      console.log(acc)
      reader = await manual(acc);
      preamble = "\nSIMULATOR CLAUDE:\n"
      acc = ""
      p = document.createElement("p");
      span = document.createElement("span");
      p.appendChild(span);
      span.className = "simulator";
      span.innerHTML = (preamble + acc).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
      mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
    } else if (value) {
      console.log(value)
      acc += value
      // if (!mutWriteLines) return
      // let p = document.createElement("p");
      span.innerHTML = (preamble + acc).replace(/\n/g, "<br>").replace(/ /g, "&nbsp;");
      // mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
    }
  }

  console.log(acc)
}

function tabKey() {
  let currInput = USERINPUT.value;

  for (const ele of COMMANDS) {
    if (ele.startsWith(currInput)) {
      USERINPUT.value = ele;
      return
    }
  }
}

function arrowKeys(e: string) {
  switch (e) {
    case "ArrowDown":
      if (historyIdx !== HISTORY.length) {
        historyIdx += 1;
        USERINPUT.value = HISTORY[historyIdx];
        if (historyIdx === HISTORY.length) USERINPUT.value = tempInput;
      }
      break;
    case "ArrowUp":
      if (historyIdx === HISTORY.length) tempInput = USERINPUT.value;
      if (historyIdx !== 0) {
        historyIdx -= 1;
        USERINPUT.value = HISTORY[historyIdx];
      }
      break;
  }
}

function commandHandler(input: string) {
  // if (input.startsWith("rm -rf") && input.trim() !== "rm -rf") {
  //   if (isSudo) {
  //     if (input === "rm -rf src" && !bareMode) {
  //       bareMode = true;

  //       setTimeout(() => {
  //         if (!TERMINAL || !WRITELINESCOPY) return
  //         TERMINAL.innerHTML = "";
  //         TERMINAL.appendChild(WRITELINESCOPY);
  //         mutWriteLines = WRITELINESCOPY;
  //       });

  //       easterEggStyles();
  //       setTimeout(() => {
  //         writeLines(["What made you think that was a good idea?", "<br>"]);
  //       }, 200)

  //       setTimeout(() => {
  //         writeLines(["Now everything is ruined.", "<br>"]);
  //       }, 1200)

  //     } else if (input === "rm -rf src" && bareMode) {
  //       writeLines(["there's no more src folder.", "<br>"])
  //     } else {
  //       if (bareMode) {
  //         writeLines(["What else are you trying to delete?", "<br>"])
  //       } else {
  //         writeLines(["<br>", "Directory not found.", "type <span class='command'>'ls'</span> for a list of directories.", "<br>"]);
  //       }
  //     }
  //   } else {
  //     writeLines(["Permission not granted.", "<br>"]);
  //   }
  //   return
  // }

  switch (input) {
    case 'clear':
      setTimeout(() => {
        if (!TERMINAL || !WRITELINESCOPY) return
        TERMINAL.innerHTML = "";
        TERMINAL.appendChild(WRITELINESCOPY);
        mutWriteLines = WRITELINESCOPY;
      })
      break;
    case 'banner':
      if (bareMode) {
        writeLines(["WebShell v1.0.0", "<br>"])
        break;
      }
      writeLines(BANNER);
      break;
    case 'help':
      if (bareMode) {
        writeLines(["maybe restarting your browser will fix this.", "<br>"])
        break;
      }
      writeLines(HELP);
      break;
    // case 'whoami':
    //   if (bareMode) {
    //     writeLines([`${command.username}`, "<br>"])
    //     break;
    //   }
    //   writeLines(createWhoami());
    //   break;
    // case 'about':
    //   if (bareMode) {
    //     writeLines(["Nothing to see here.", "<br>"])
    //     break;
    //   }
    //   writeLines(ABOUT);
    //   break;
    // case 'projects':
    //   if (bareMode) {
    //     writeLines(["I don't want you to break the other projects.", "<br>"])
    //     break;
    //   }
    //   writeLines(PROJECTS);
    //   break;
    // case 'repo':
    //   writeLines(["Redirecting to github.com...", "<br>"]);
    //   setTimeout(() => {
    //     window.open(REPO_LINK, '_blank');
    //   }, 500);
    //   break;
    // case 'linkedin':
    //   //add stuff here
    //   break;
    // case 'github':
    //   //add stuff here
    //   break;
    // case 'email':
    //   //add stuff here
    //   break;
    // case 'rm -rf':
    //   if (bareMode) {
    //     writeLines(["don't try again.", "<br>"])
    //     break;
    //   }

    //   if (isSudo) {
    //     writeLines(["Usage: <span class='command'>'rm -rf &lt;dir&gt;'</span>", "<br>"]);
    //   } else {
    //     writeLines(["Permission not granted.", "<br>"])
    //   }
    //   break;
    // case 'sudo':
    //   if (bareMode) {
    //     writeLines(["no.", "<br>"])
    //     break;
    //   }
    //   if (!PASSWORD) return
    //   isPasswordInput = true;
    //   USERINPUT.disabled = true;

    //   if (INPUT_HIDDEN) INPUT_HIDDEN.style.display = "none";
    //   PASSWORD.style.display = "block";
    //   setTimeout(() => {
    //     PASSWORD_INPUT.focus();
    //   }, 100);

    //   break;
    // case 'ls':
    //   if (bareMode) {
    //     writeLines(["", "<br>"])
    //     break;
    //   }

    //   if (isSudo) {
    //     writeLines(["src", "<br>"]);
    //   } else {
    //     writeLines(["Permission not granted.", "<br>"]);
    //   }
    //   break;
    default:
      if (bareMode) {
        writeLines(["type 'help'", "<br>"])
        break;
      }

      writeLines(DEFAULT);
      break;
  }
}

function writeLines(message: string[]) {
  message.forEach((item, idx) => {
    displayText(item, idx);
  });
}

function displayText(item: string, idx: number) {
  setTimeout(() => {
    if (!mutWriteLines) return
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
        resolve()
        return
      }
      const p = document.createElement("p");
      p.innerHTML = item;
      mutWriteLines.parentNode!.insertBefore(p, mutWriteLines);
      scrollToBottom();
      resolve();
    }, 40 * idx);
  });
}

// function revertPasswordChanges() {
//   if (!INPUT_HIDDEN || !PASSWORD) return
//   PASSWORD_INPUT.value = "";
//   USERINPUT.disabled = false;
//   INPUT_HIDDEN.style.display = "block";
//   PASSWORD.style.display = "none";
//   isPasswordInput = false;

//   setTimeout(() => {
//     USERINPUT.focus();
//   }, 200)
// }

// function passwordHandler() {
//   if (passwordCounter === 2) {
//     if (!INPUT_HIDDEN || !mutWriteLines || !PASSWORD) return
//     writeLines(["<br>", "INCORRECT PASSWORD.", "PERMISSION NOT GRANTED.", "<br>"])
//     revertPasswordChanges();
//     passwordCounter = 0;
//     return
//   }

//   if (PASSWORD_INPUT.value === SUDO_PASSWORD) {
//     if (!mutWriteLines || !mutWriteLines.parentNode) return
//     writeLines(["<br>", "PERMISSION GRANTED.", "Try <span class='command'>'rm -rf'</span>", "<br>"])
//     revertPasswordChanges();
//     isSudo = true;
//     return
//   } else {
//     PASSWORD_INPUT.value = "";
//     passwordCounter++;
//   }
// }

// function easterEggStyles() {
//   const bars = document.getElementById("bars");
//   const body = document.body;
//   const main = document.getElementById("main");
//   const span = document.getElementsByTagName("span");

//   if (!bars) return
//   bars.innerHTML = "";
//   bars.remove()

//   if (main) main.style.border = "none";

//   body.style.backgroundColor = "black";
//   body.style.fontFamily = "VT323, monospace";
//   body.style.fontSize = "20px";
//   body.style.color = "white";

//   for (let i = 0; i < span.length; i++) {
//     span[i].style.color = "white";
//   }

//   USERINPUT.style.backgroundColor = "black";
//   USERINPUT.style.color = "white";
//   USERINPUT.style.fontFamily = "VT323, monospace";
//   USERINPUT.style.fontSize = "20px";
//   if (PROMPT) PROMPT.style.color = "white";

// }

const initEventListeners = () => {
  if (NAME === "") {
    console.log("check")
    if (MAIN_PROMPT) {
      MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
    }
    // if (USERINPUT) {
    //   USERINPUT.focus()
    // }
  } else {
    if (PROMPT) {
      PROMPT.innerHTML = `<span id="prompt"><span id="user">${command.username}</span>@<span id="host">${command.hostname}</span>:$ ~ `
    }
  }


  if (PRE_HOST) {
    PRE_HOST.innerText = command.hostname;
  }

  if (PRE_USER) {
    PRE_USER.innerText = command.username;
  }

  window.addEventListener('load', async () => {
    await asyncWriteLines(BANNER);
    await asyncWriteLines(HELP)
    if (USERINPUT) {
      USERINPUT.focus()
    }
    getUser();
    newSession();
  });

  USERINPUT.addEventListener('keypress', userInputHandler);
  USERINPUT.addEventListener('keydown', userInputHandler);
  PASSWORD_INPUT.addEventListener('keypress', userInputHandler);

  window.addEventListener('click', () => {
    if (window && USERINPUT) {
      const selection = window.getSelection()?.toString();
      if (!selection || (selection && selection.length === 0)) {
        USERINPUT.focus();
      }
    }
  });



  // console.log(`%cPassword: ${command.password}`, "color: red; font-size: 20px;");
}

initEventListeners();
