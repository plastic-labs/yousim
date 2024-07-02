import auth from "../auth";
import { getStorage, setStorage } from "../utils";

const SUCCESS_STRING =
  "Please type the 6 digit code sent to your email with the following command: login 111111";

export async function login(email: string) {
  const { data, error } = await auth.updateUser({ email: email });
  if (error) {
    console.log(error.message);
    if (
      error.message ===
      "A user with this email address has already been registered"
    ) {
      const { data, error } = await auth.signInWithOtp({ email: email });
      if (error) {
        return `We couldn't sign you in. Please try again later. Error: ${error.message}`;
      }
      console.log(data);
      setStorage("lastAttemptedEmail", email);
      setStorage("loginType", "email");
      return SUCCESS_STRING;
    }
    return `We couldn't log you in. Please try again later. Error: ${error.message}`;
  }
  console.log(data);
  setStorage("lastAttemptedEmail", email);
  setStorage("loginType", "email_change");
  return SUCCESS_STRING;
}

export async function verifyOTP(code: string) {
  const email = getStorage("lastAttemptedEmail");
  const loginType = getStorage("loginType") as "email" | "email_change";
  if (!email || !loginType) {
    return "Please run login with your email first";
  }
  const { data, error } = await auth.verifyOtp({
    email,
    token: code,
    type: loginType,
  });
  if (error) {
    return `We couldn't verify your code. Please try again later. Error: ${error.message}`;
  }
  console.log(data);
  return "You're logged in!";
}
