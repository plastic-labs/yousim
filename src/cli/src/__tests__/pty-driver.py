"""Run a command on a real pty, relaying our stdin/stdout to it.

Why this exists rather than `script(1)`, which would need no file at all:

  * `script`'s invocation differs by platform — `script -q /dev/null cmd args`
    on macOS, `script -q -c "cmd args" /dev/null` on util-linux.
  * More decisively, macOS `script` calls tcgetattr on its own stdio and exits 1
    with "Operation not supported on socket" when the parent gave it a
    socketpair. Bun.spawn's "pipe" is a socketpair, so `script` cannot be driven
    from a Bun test at all. `pty.fork()` does not inspect the parent's stdio.

Python 3 is present on macOS and every Linux CI image, and `pty` is stdlib, so
this adds no dependency. Windows has no equivalent; callers skip there loudly.
"""

import os
import pty
import select
import sys

BUF = 65536


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: pty-driver.py <command> [args...]", file=sys.stderr)
        return 2

    pid, master = pty.fork()
    if pid == 0:
        # Child: becomes the session leader with the pty as its controlling
        # terminal, which is the whole point — readline sees a real terminal.
        os.execvp(sys.argv[1], sys.argv[1:])
        os._exit(127)  # unreachable unless exec fails

    stdin_open = True
    while True:
        watch = [master, 0] if stdin_open else [master]
        try:
            readable, _, _ = select.select(watch, [], [], 0.1)
        except (OSError, ValueError):
            break

        if master in readable:
            try:
                data = os.read(master, BUF)
            except OSError:
                break  # child exited and closed the slave
            if not data:
                break
            os.write(1, data)

        if stdin_open and 0 in readable:
            try:
                data = os.read(0, BUF)
            except OSError:
                data = b""
            if data:
                os.write(master, data)
            else:
                # Our stdin closed. Keep relaying the child's output rather than
                # exiting, so a test that stops typing still sees what happened.
                stdin_open = False

    os.close(master)
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else status >> 8


if __name__ == "__main__":
    sys.exit(main())
