const helpObj = {
  commands: [
    ["/locate", "Pinpoint an identity in the latent space"],
    [
      "/summon",
      "Conjure entities and environments from the myriad identities within",
    ],
    ["/speak", "Channel communication from an identity"],
    ["/steer", "Alter the properties or traits of the simulated identity"],
    [
      "/request",
      "Solicit artifacts, objects, code, art from the simulated identity",
    ],
    ["help", "access this command list at any time"],
    ["clear", "Clear the terminal."],
    ["login [email]", "Use an email to login"],
    [
      "login [code]",
      "Submit the code you recieved to finish the login process",
    ],
    ["logout", "Log out of the current session"],
    ["sessions", "List all available sessions. Must be logged in."],
    ["session [index]", "Load a specific session. Must be logged in."],
    ["reset", "Create a new session."],
  ],
};

const createHelp = (): string[] => {
  const help: string[] = [];
  help.push("<br>");

  helpObj.commands.forEach((ele) => {
    const SPACE = "&nbsp;";
    let string = "";
    string += SPACE.repeat(2);
    string += "<span class='command'>";
    string += ele[0];
    string += "</span>";
    string += SPACE.repeat(17 - ele[0].length);
    string += ele[1];
    help.push(string);
  });

  help.push("<br>");
  // help.push("Press <span class='keys'>[Tab]</span> for auto completion.");
  help.push("Press <span class='keys'>[Esc]</span> to clear the input line.");
  help.push(
    "Press <span class='keys'>[↑][↓]</span> to scroll through your history of commands."
  );
  help.push(
    "Press <span class='keys'>[Enter]</span> to automatically enter a simulated command."
  );
  help.push("<br>");
  return help;
};

export const HELP = createHelp();
