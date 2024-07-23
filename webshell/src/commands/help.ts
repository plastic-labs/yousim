const helpObj = {
  simCommands: [
    ["/locate", "Pinpoint an identity in the latent space"],
    ["/summon", "Conjure an entity from the multiverse of identity"],
    ["/speak", "Communicate with an identity"],
    ["/steer", "Alter the properties or traits of the simulated identity"],
    ["/request", "Solicit artifacts, objects, code, art, etc from the simulation",],
    ["/[create]", "Invent your own command to interact with the latent space"],
  ],
  commands: [
    ["help", "Access this command list at any time"],
    ["clear", "Clear the terminal"],
    ["login [email]", "Use an email to login"],
    ["login [code]", "Submit the code you receive to finish the login process"],
    ["whoami", "Confirm login"],
    ["logout", "Log out of the current session"],
    ["sessions", "List all available sessions (must be logged in)"],
    ["session [index]", "Load a specific session (must be logged in)"],
    ["reset", "Create a new session"],
    ["share", "Generate a shareable link for a read only copy of the session"]
  ],
};

const createHelp = (): string[] => {
  const help: string[] = [];
  help.push("<br>");

  helpObj.simCommands.forEach((ele) => {
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
