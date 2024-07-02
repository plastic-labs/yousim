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
      storage &&
      storage.length !== 0
    );
  }
}

// Function to set a cookie
function setCookie(key: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = key + "=" + value + ";expires=" + expires.toUTCString();
}

// Function to get a cookie value
function getCookie(key: string) {
  const keyValue = document.cookie.match("(^|;) ?" + key + "=([^;]*)(;|$)");
  return keyValue ? keyValue[2] : null;
}

// Function to remove a cookie
// function removeCookie(key: string) {
//   document.cookie = key + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
// }

// Function to get a value from storage (localStorage or cookie)
function getStorage(key: string) {
  if (storageAvailable("localStorage")) {
    return localStorage.getItem(key);
  } else {
    return getCookie(key);
  }
}

// Function to get a value from storage (localStorage or cookie)
function setStorage(key: string, value: string) {
  if (storageAvailable("localStorage")) {
    return localStorage.setItem(key, value);
  } else {
    return setCookie(key, value, 365);
  }
}

export { getStorage, setStorage };
