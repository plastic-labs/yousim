import { loadSession } from "./input";
import Swal from "sweetalert2";
import { asyncWriteLines } from "./display";
import { getSharedMessages } from "./honcho";
import { BANNER } from "./commands/banner";

document.addEventListener('DOMContentLoaded', async () => {
  await asyncWriteLines(BANNER);
  const sessionId = new URLSearchParams(window.location.search).get("code");
  if (sessionId) {
    const sessionMessages = await getSharedMessages(sessionId);
    // const sessionMessages = await getSessionMessages(sessions[0].id);
    if (sessionMessages) {
      loadSession(sessionMessages);
    }
  } else {
    Swal.fire({
      title: "Welcome to YouSim",
      text: "Sorry this is an invalid link",
      icon: "info",
      heightAuto: false,
    });
  }

})
