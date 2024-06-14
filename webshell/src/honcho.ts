import { v4 as uuidv4 } from 'uuid';
const API_URL = "http://localhost:8000"

/*
 *
 * */
export function getUser() {
  const username = localStorage.getItem("username")
  const user_id = localStorage.getItem("user_id")
  // const session_id = localStorage.getItem("session_id")

  if (username) {
    // The value already exists
    console.log("Value already here")
    console.log(username)
    if (!user_id) {
      return fetch(`${API_URL}/user?name=${username}`)
        .then(response => response.json())
        .then(data => {
          console.log(data)
          localStorage.setItem("user_id", data.user_id)
          return data
        })
    } else {
      console.log(user_id)
    }
  } else {
    // If the value does not exist
    const newUsername = uuidv4();
    localStorage.setItem("username", newUsername)
    return fetch(`${API_URL}/user?name=${newUsername}`)
      .then(response => response.json())
      .then(data => {
        console.log(data)
        localStorage.setItem("user_id", data.user_id)
        return data
      })
  }

}



export function newSession() {
  const user_id = localStorage.getItem("user_id")
  return fetch(`${API_URL}/reset?user_id=${user_id}`)
    .then(response => response.json())
    .then(data => {
      console.log(data)
      localStorage.setItem("session_id", data.session_id)
      return data
    })
}

export function checkSession() {
  const session_id = localStorage.getItem("session_id")
  if (!session_id) {
    newSession()
  }
  console.log(session_id)
}

// function check() {
//   const user_id = localStorage.getItem("user_id")
//   const session_id = localStorage.getItem("session_id")
//   if (!user_id) {
//     return false
//   } else {
//     return true
//   }
// }

export async function manual(command: string) {
  const user_id = localStorage.getItem("user_id")
  const session_id = localStorage.getItem("session_id")
  const req = await fetch(`${API_URL}/manual`, {
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

  const reader = req.body?.pipeThrough(new TextDecoderStream()).getReader()!;
  return reader

}

export async function auto() {
  const user_id = localStorage.getItem("user_id")
  const session_id = localStorage.getItem("session_id")
  const req = await fetch(`${API_URL}/auto`, {
    method: "POST",
    body: JSON.stringify({
      user_id,
      session_id
    }),
    headers: {
      "Content-Type": "application/json"
    }
  })

  const reader = req.body?.pipeThrough(new TextDecoderStream()).getReader()!;
  return reader
}
