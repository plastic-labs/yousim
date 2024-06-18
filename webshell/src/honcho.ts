import { v4 as uuidv4 } from 'uuid';
import * as Sentry from "@sentry/browser";
const API_URL = import.meta.env.VITE_API_URL

// https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
function storageAvailable(type: string) {
  let storage: Storage | null = null;
  try {
    // @ts-ignore
    storage = window[type];
    if (storage) {
      const x = "__storage_test__";
      storage.setItem(x, x);
      storage.removeItem(x);
      return true;
    } else {
      return false;
    }
  } catch (e) {
    return (
      e instanceof DOMException &&
      // everything except Firefox
      (e.code === 22 ||
        // Firefox
        e.code === 1014 ||
        // test name field too, because code might not be present
        // everything except Firefox
        e.name === "QuotaExceededError" ||
        // Firefox
        e.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
      // acknowledge QuotaExceededError only if there's something already stored
      storage
      && storage.length !== 0
    );
  }
}

// Function to set a cookie
function setCookie(key: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = key + '=' + value + ';expires=' + expires.toUTCString();
}

// Function to get a cookie value
function getCookie(key: string) {
  const keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
  return keyValue ? keyValue[2] : null;
}

// Function to remove a cookie
// function removeCookie(key: string) {
//   document.cookie = key + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
// }

// Function to get a value from storage (localStorage or cookie)
function getStorage(key: string) {
  if (storageAvailable("localStorage")) {
    return localStorage.getItem(key)
  } else {
    return getCookie(key)
  }
}

// Function to get a value from storage (localStorage or cookie)
function setStorage(key: string, value: string) {
  if (storageAvailable("localStorage")) {
    return localStorage.setItem(key, value)
  } else {
    return setCookie(key, value, 365)
  }
}

/*
 *
 * */
export async function getUser() {
  let username = getStorage("username")
  // let user_id = getStorage("user_id")
  // const session_id = getStorage("session_id")

  if (!username) {
    const newUsername = uuidv4();
    setStorage("username", newUsername)
  }// If the value does not exist
  return fetch(`${API_URL}/user?name=${username}`)
    .then(response => response.json())
    .then(data => {
      console.log(data)
      setStorage("user_id", data.user_id)
      return data
    })
    .catch((err) => {
      console.log(err)
      alert("possible error try refreshing the page")
    })
}

export async function newSession() {
  const user_id = getStorage("user_id")
  return fetch(`${API_URL}/reset?user_id=${user_id}`)
    .then(response => response.json())
    .then(data => {
      // console.log(data)
      setStorage("session_id", data.session_id)
      return data
    })
    .catch((err) => {
      console.log(err)
      alert("possible error try refreshing the page")
    })

}

export function checkSession() {
  const session_id = getStorage("session_id")
  if (!session_id) {
    newSession()
  }
  // console.log(session_id)
}

// async function setup() {
//   return getUser()
//     .then(() => {
//       return newSession()
//     })
// }

// function check() {
//   const user_id = getStorage("user_id")
//   const session_id = getStorage("session_id")
//   if (!user_id) {
//     return false
//   } else {
//     return true
//   }
// }

export async function manual(command: string) {
  const user_id = getStorage("user_id")
  const session_id = getStorage("session_id")
  if (user_id && session_id) {
    return fetch(`${API_URL}/manual`, {
      method: "POST",
      body: JSON.stringify({
        command,
        user_id,
        session_id
      }),
      headers: {
        "Content-Type": "application/json"
      }
    })
      .then((res) => {
        const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader()!;
        return reader;
      })
      .catch(err => {
        Sentry.captureException(err)
        console.error(err)
        alert("Something went wrong - we recommend refreshing the page")
      })
  } {
    Sentry.captureException({ user_id, session_id })
    alert("possible error try refreshing the page")
    // await setup()
  }
}

export async function auto() {
  const user_id = getStorage("user_id")
  const session_id = getStorage("session_id")
  if (user_id && session_id) {
    return fetch(`${API_URL}/auto`, {
      method: "POST",
      body: JSON.stringify({
        user_id,
        session_id
      }),
      headers: {
        "Content-Type": "application/json"
      }
    })
      .then(res => {
        const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader()!;
        return reader;
      })
      .catch(err => {
        Sentry.captureException(err);
        console.error(err)
        alert("Something went wrong - we recommend refreshing the page")
      })
  } else {
    Sentry.captureException({ user_id, session_id })
    alert("possible error try refreshing the page")
  }
}
