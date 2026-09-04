import command from "../config.json" assert { type: "json" };
import posthog from "posthog-js";
import { writeLines } from "./display";
import auth, { getJWT } from "./auth";
import { login, verifyOTP } from "./commands/login";
import { getStorage, setStorage, sanitize } from "./utils";
import {
  newSession,
  getSessionMessages,
  getSessions,
  updateSessionMetadata,
  getShareCode,
  SessionData,
  exportSession,
  getSummary,
  chat,
  getIdentity
} from "./honcho";
import { localManual, localAuto } from "./sim";
import { HELP } from "./commands/help";
import { BANNER } from "./commands/banner";
import { DEFAULT } from "./commands/default";
import {
  HISTORY,
  COMMANDS,
  USERINPUT,
  TERMINAL,
  PROMPT,
  MAIN_PROMPT,
} from "./constants";

interface Summary {
  id: string;
  content: string;
  created_at: string;
}

interface CommandConfig {
  username: string;
  hostname: string;
}

const commandConfig = command as CommandConfig;

let mutWriteLines = document.getElementById("write-lines");
let historyIdx = 0;
let tempInput = "";
let userInput: string;
let isPasswordInput = false;
let NAME = "";
const WRITELINESCOPY = mutWriteLines;

// Utility Functions related to the state of the terminal

function setName(name: string) {
  NAME = name;
}

let SHOULD_SCROLL_TO_BOTTOM = true;

const scrollToBottom = () => {
  const scrollZone = document.getElementById("scroll-zone");
  if (scrollZone && SHOULD_SCROLL_TO_BOTTOM) {
    scrollZone.scrollTop = scrollZone.scrollHeight;
  }
};

function setupScrollListener() {
  const scrollZone = document.getElementById("scroll-zone");
  if (!scrollZone) return;

  let isAtBottom = true;

  scrollZone.addEventListener("scroll", () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollZone;
    const scrolledToBottom =
      Math.abs(scrollHeight - clientHeight - scrollTop) < 1;

    if (scrolledToBottom && !isAtBottom) {
      isAtBottom = true;
      SHOULD_SCROLL_TO_BOTTOM = true;
    } else if (!scrolledToBottom && isAtBottom) {
      isAtBottom = false;
      SHOULD_SCROLL_TO_BOTTOM = false;
    }
  });
}

// Call this function to set up the scroll listener
setupScrollListener();

function loadSession(data: SessionData) {
  data?.messages.forEach((message) => {
    let p = document.createElement("p");
    let span = document.createElement("span");
    let acc = message.is_user
      ? "\nSEARCHER CLAUDE:\n"
      : "\nSIMULATOR CLAUDE:\n";
    acc += message.content;
    span.className = message.is_user ? "searcher" : "simulator";
    // if (message.is_user) {
    //   span.className = "searcher";
    //   p.appendChild(span);
    //   span.innerHTML = sanitize(acc)
    //   mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    // } else {
    // span.className = "simulator";
    p.appendChild(span);
    span.innerHTML = sanitize(acc);
    mutWriteLines?.parentNode!.insertBefore(p, mutWriteLines);
    // }
    scrollToBottom();
  });
}

// Functions corresponding to the different key presses

function tabKey() {
  let currInput = USERINPUT.value;

  for (const ele of COMMANDS) {
    if (ele.startsWith(currInput)) {
      USERINPUT.value = ele;
      return;
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

async function enterKey() {
  const currentMode = getStorage("mode");
  // console.table({
  //   NAME,
  //   username: command.username,
  //   hostname: command.hostname,
  //   MAIN_PROMPT,
  // });

  if (!mutWriteLines || !PROMPT) return;
  const resetInput = "";
  let newUserInput;
  userInput = USERINPUT.value;

  posthog.capture("command sent", { command: userInput });

  newUserInput = `<span class='output'>${userInput}</span>`;

  HISTORY.push(userInput);
  historyIdx = HISTORY.length;

  if (userInput.startsWith("login")) {
    const components = userInput.split(" ");
    if (components.length !== 2) {
      writeLines(["Usage: login &lt;email&gt; or login &lt;code&gt;", "<br>"]);
      return;
    }
    const emailRegex =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    const codeRegex = /^\d{6}$/;

    switch (true) {
      case emailRegex.test(components[1]):
        const emailResponse = await login(components[1]);
        writeLines([emailResponse, "<br>"]);
        break;
      case codeRegex.test(components[1]):
        const codeResponse = await verifyOTP(components[1]);
        writeLines([codeResponse, "<br>"]);
        await newSession();
        window.location.reload();
        break;
      default:
        writeLines([
          "Invalid usage. Please provide an email address or a 6 digit numeric code.",
          "<br>",
        ]);
        break;
    }

    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("logout")) {
    auth.signOut();
    await getJWT();
    writeLines(["You have been logged out.", "<br>"]);
    setStorage("session_id", "");
    window.location.reload();
    return;
  }

  if (userInput.startsWith("mode")) {
    const components = userInput.split(" ");
    if (components.length !== 2 || !["simulator", "constructor"].includes(components[1])) {
      writeLines([`Current Mode: ${currentMode}`, "<br>"]);
    } else if (components[1] === currentMode) {
      writeLines([`Already in ${currentMode} mode`, "<br>"]);

    } else {
      setStorage("mode", components[1]);
      const sessions = await getSessions();
      if (sessions && sessions.length > 0) {
        setStorage("session_id", sessions[0].id);
      }

      window.location.reload()
    }
    // currentMode = components[1];
    // await newSession();
    // writeLines([`Switched to ${currentMode} mode`, "<br>"]);
    // if (MAIN_PROMPT) {
    //   MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
    // }
    // NAME = "";
    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("whoami")) {
    USERINPUT.value = resetInput;
    const session = await auth.getSession();
    const email = session.data.session?.user.email;
    console.log(session);
    if (email) {
      writeLines([`You are logged in as ${email}`, "<br>"]);
    } else {
      writeLines([`You are not currently logged in`, "<br>"]);
    }
    // const div = document.createElement("div");
    // div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("share")) {
    USERINPUT.value = resetInput;
    const code = await getShareCode();
    const link = `https://yousim.ai/share?code=${code}`;
    writeLines([
      "Share Link:",
      "<br>",
      `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`,
      "<br>",
    ]);
    // const div = document.createElement("div");
    // div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  // if (userInput.startsWith("sessions")) {
  if (userInput.startsWith("session")) {
    USERINPUT.value = resetInput;

    // if (await isAnon()) {
    //   writeLines(["You are not logged in.", "<br>"]);
    //   return;
    // }

    const components = userInput.split(" ");

    if (components.length === 1) {
      const sessions = await getSessions();
      // console.trace(sessions);
      if (sessions && sessions.length > 0) {
        const sessionList = sessions.map((session, index) => {
          const date = new Date(session.created_at).toLocaleString();
          // @ts-ignore - It's a dicionary so name is not a known value
          const sessionName = session.metadata?.name ?? "UNKNOWN";
          return `${index}: ${date} - ${sessionName}`;
        });
        writeLines(["Available sessions:", ...sessionList, "<br>"]);
      } else {
        writeLines(["No sessions found.", "<br>"]);
      }
    }

    if (components.length === 2) {
      const sessionIdx = parseInt(components[1]);
      const sessions = await getSessions();

      if (!sessions || sessions.length === 0) {
        writeLines(["No sessions found.", "<br>"]);
        return;
      }

      const session = sessions[sessionIdx];

      if (!session) {
        writeLines(["Session not found.", "<br>"]);
        return;
      }

      commandHandler("clear");
      const sessionData = await getSessionMessages(session.id);
      // console.trace(sessionData);
      if (sessionData) {
        setStorage("session_id", session.id);
        if (sessionData.messages.length > 0) {
          const name = currentMode === "constructor" ? sessionData.messages[0].content : sessionData.messages[0].content.slice(8);
          setName(name);
        } else {
          setName("");
        }
        loadSession(sessionData);
      }
    }

    // Ensure the prompt matches the state of the loaded session
    if (MAIN_PROMPT) {
      if (NAME === "") {
        MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
      } else {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${commandConfig.username}</span>@<span id="host">${commandConfig.hostname}</span>:$ ~ `;
      }
    }

    userInput = resetInput;
    return;
  }

  if (userInput === "reset") {
    await newSession();
    window.location.reload();
    return;
  }

  //if clear then early return
  if (userInput === "clear") {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    return;
  }

  if (userInput === "help") {
    commandHandler(userInput.toLowerCase().trim());
    USERINPUT.value = resetInput;
    userInput = resetInput;
    const div = document.createElement("div");
    div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;
    return;
  }

  if (userInput.startsWith("summary")) {
    if (currentMode == "constructor") {

      const components = userInput.split(" ");
      if (components.length === 1) {
        const summaries = await getSummary()
        if (summaries && summaries.length > 0) {
          const summaryList = summaries.map((session: Summary, index: number) => {
            const date = new Date(session.created_at).toLocaleString();
            const summaryName = `v${index}`;
            return `${index}: ${date} - ${summaryName}`;
          });
          writeLines(["Available sessions:", ...summaryList, "<br>"]);
        } else {
          writeLines(["No sessions found.", "<br>"]);
        }
      } else if (components.length === 2) {
        const summaryIdx = parseInt(components[1]);
        const summaries = await getSummary();

        if (!summaries || summaries.length === 0) {
          writeLines(["No sessions found.", "<br>"]);
          return;
        }

        const summary = summaries[summaryIdx];
        const identity = await getIdentity(summary.message_id, summary.id);
        let acc = ""
        setStorage("identity", JSON.stringify(identity))

        identity.forEach((message: any) => {
          acc += `${message.role}: ${message.content}\n`
        })
        console.log(identity)
        writeLines(["<br>", sanitize(acc), "<br>"]);
      }

      // console.trace(data);
      USERINPUT.value = resetInput;
      return;
    } else {
      USERINPUT.value = resetInput;
      writeLines([
        "<br>",
        "Summary not available for simulator mode",
        "<br>",
      ]);
      return;
    }

  }

  if (userInput.startsWith("chat")) {
    if (currentMode == "constructor") {
      const components = userInput.split(" ");
      if (components.length === 1) {
        const summaries = await getSummary()
        if (summaries && summaries.length > 0) {
          const summaryList = summaries.map((session: Summary, index: number) => {
            const date = new Date(session.created_at).toLocaleString();
            const summaryName = `v${index}`;
            return `${index}: ${date} - ${summaryName}`;
          });
          writeLines([
            "Available summaries to chat with:",
            ...summaryList,
            "<br>",
            "Use 'chat <index>' to start a new chat session with a summary",
            "Use 'sessions' to view existing chat sessions",
            "<br>"
          ]);
        } else {
          writeLines(["No summaries found.", "<br>"]);
        }
        USERINPUT.value = resetInput;
        return
      } else if (components.length === 2) {
        const summaryIdx = parseInt(components[1]);
        const summaries = await getSummary();

        if (!summaries || summaries.length === 0) {
          writeLines(["No summaries found.", "<br>"]);
          return;
        }

        const summary = summaries[summaryIdx];
        if (!summary) {
          writeLines(["Summary not found.", "<br>"]);
          return;
        }
        const currentSessionId = getStorage("session_id");

        if (!currentSessionId) {
          writeLines(["No active session. Switching back to constructor mode.", "<br>"]);
          setStorage("mode", "constructor");
          USERINPUT.value = resetInput;
            return;
        }

        setStorage("mode", "chat");
        
        // Create a new chat session
        await newSession();
        // Store the summary ID and set mode to chat
        setStorage("chat_original_session_id", currentSessionId);
        setStorage("chat_summary_id", summary.id);
        setStorage("chat_summary_message_id", summary.message_id);
        await updateSessionMetadata({ 
          summary_id: summary.id,
        });

        writeLines([
          "<br>",
          "Started new chat session. Type your messages to chat.",
          "Use 'mode constructor' to leave chat mode.",
          "Use 'sessions' to switch between chat sessions.",
          "<br>",
        ]);
        USERINPUT.value = resetInput;
        return;
      }
    } else {
      USERINPUT.value = resetInput;
      writeLines([
        "<br>",
        "Chat command only available in constructor mode",
        "<br>",
      ]);
      return;
    }
  }

  // Handle chat mode interactions
  if (currentMode === "chat" && !userInput.startsWith("mode")) {
    // Get the stored summary ID from session metadata
    const sessionId = getStorage("session_id");
    if (!sessionId) {
      writeLines([
        "<br>",
        "Error: No active session. Switching back to constructor mode.",
        "<br>",
      ]);
      setStorage("mode", "constructor");
      USERINPUT.value = resetInput;
      return;
    }

    // Create a new div for user message
    const userDiv = document.createElement("div");
    userDiv.innerHTML = `<span class="searcher">YOU: ${sanitize(userInput)}</span>`;
    mutWriteLines?.parentNode!.insertBefore(userDiv, mutWriteLines);

    // Create a new div for assistant response
    const assistantDiv = document.createElement("div");
    assistantDiv.innerHTML = `<span class="simulator">IDENTITY: </span>`;
    mutWriteLines?.parentNode!.insertBefore(assistantDiv, mutWriteLines);

    try {
      // Use the chat function which uses sendCommand internally
      console.log("Sending chat request with sessionId:", sessionId, "userInput:", userInput);
      const reader = await chat(sessionId, userInput);
      console.log("Got reader response:", reader);
      
      if (reader) {
        let response = "";
        let more = true;
        while (more) {
          try {
            const { done, value } = await reader.read();
            console.log("Stream read result:", { done, value });
            
            if (done) {
              console.log("Stream complete");
              more = false;
              continue;
            }
            
            if (value) {
              console.log("Received value:", value);
              response += value;
              assistantDiv.innerHTML = `<span class="simulator">IDENTITY: ${sanitize(response)}</span>`;
              scrollToBottom();
            }
          } catch (readError) {
            console.error("Error reading from stream:", readError);
            more = false;
          }
        }
      } else {
        console.error("No reader returned from chat function");
        assistantDiv.innerHTML = `<span class="simulator">IDENTITY: Error: No response received</span>`;
      }
    } catch (error) {
      console.error("Error in chat handling:", error);
      assistantDiv.innerHTML = `<span class="simulator">IDENTITY: Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}</span>`;
    }

    USERINPUT.value = resetInput;
    return;
  }

  if (userInput.startsWith("export")) {
    USERINPUT.value = resetInput;
    writeLines([
      "<br>",
      "Starting download...",
      "<br>",
    ]);
    const success = await exportSession();
    if (success) {
      writeLines([
        "Your conversation has been exported and download should begin shortly.",
        "<br>",
      ]);
    }
    return;
  }

  const div = document.createElement("div");
  div.innerHTML = `<span id="prompt">${PROMPT.innerHTML}</span> ${newUserInput}`;

  if (mutWriteLines.parentNode) {
    mutWriteLines.parentNode.insertBefore(div, mutWriteLines);
  }

  USERINPUT.value = resetInput;

  USERINPUT.disabled = true;
  if (MAIN_PROMPT) {
    MAIN_PROMPT.innerHTML = "LOADING...";
  }
  if (NAME === "") {
    if (userInput) {
      NAME = userInput;
      try {
        await updateSessionMetadata({ name: userInput });
      } catch (e) {
        console.error(e);
        try {
          await newSession();
          await updateSessionMetadata({ name: userInput });
        } catch (e2) {
          console.error("Failed to update session metadata:", e2);
          alert(
            "Failed to update session metadata. Please try resetting the conversation"
          );
        }
      }
      const command = currentMode === "simulator" ? `/locate ${userInput}` : userInput;
      await localManual(command);
      // await Promise.all([updatePromise, responsePromise]);
      if (MAIN_PROMPT) {
        MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${commandConfig.username}</span>@<span id="host">${commandConfig.hostname}</span>:$ ~ `;
      }
    }
  } else if (userInput === "") {
    await localAuto();
  } else {
    await localManual(userInput);
  }
  if (MAIN_PROMPT) {
    if (NAME === "") {
      MAIN_PROMPT.innerHTML = "Enter a Name to Simulate >>> ";
    } else {
      MAIN_PROMPT.innerHTML = `<span id="prompt"><span id="user">${commandConfig.username}</span>@<span id="host">${commandConfig.hostname}</span>:$ ~ `;
    }
  }
  USERINPUT.disabled = false;
  USERINPUT.focus();

  userInput = resetInput;
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

function commandHandler(input: string) {
  switch (input) {
    case "clear":
      setTimeout(() => {
        if (!TERMINAL || !WRITELINESCOPY) return;
        TERMINAL.innerHTML = "";
        TERMINAL.appendChild(WRITELINESCOPY);
        mutWriteLines = WRITELINESCOPY;
      });
      break;
    case "banner":
      writeLines(BANNER);
      break;
    case "help":
      writeLines(HELP);
      break;
    default:
      writeLines(DEFAULT);
      break;
  }
}

export {
  userInputHandler,
  scrollToBottom,
  mutWriteLines,
  NAME,
  setName,
  loadSession,
};
